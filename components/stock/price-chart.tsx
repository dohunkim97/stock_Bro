"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { useGolgoo } from "./golgoo-context";

type ChartPeriod = "D" | "W" | "M";
const PERIOD_LABEL: Record<ChartPeriod, string> = { D: "일봉", W: "주봉", M: "월봉" };

type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };

type HoverInfo = {
  date: string;
  close: number;
  prevClose: number | null;
  volume: number;
  mas: Record<number, number | undefined>;
};

type HoverState = { info: HoverInfo; x: number; y: number };

const MOVING_AVERAGES: { period: number; color: string }[] = [
  { period: 5, color: "#f59e0b" },
  { period: 60, color: "#22c55e" },
  { period: 200, color: "#9ca3af" },
];

// lightweight-charts' crosshair callback hands back Time in whatever shape
// the series was given — for whole-day (non-intraday) series like ours that
// can be the original "yyyy-mm-dd" string OR an internal {year,month,day}
// BusinessDay object depending on version/config, so normalize both back to
// the same string format used as the key everywhere else in this file.
function timeToDateStr(t: unknown): string | null {
  if (typeof t === "string") return t;
  if (t && typeof t === "object" && "year" in t && "month" in t && "day" in t) {
    const { year, month, day } = t as { year: number; month: number; day: number };
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

// 네이버증권 HTS 스타일 — 연 경계는 "YYYY/MM", 그 외 월 경계는 "MM", 날짜 단위는
// "DD"만 짧게 표시. 항상 전체 "YYYY-MM-DD"를 찍던 이전 방식보다 훨씬 덜 빽빽함.
function naverTickFormatter(time: unknown, tickMarkType: TickMarkType): string | null {
  const d = timeToDateStr(time);
  if (!d) return null;
  const [y, m, day] = d.split("-");
  switch (tickMarkType) {
    case TickMarkType.Year:
      return `${y}/${m}`;
    case TickMarkType.Month:
      return m;
    case TickMarkType.DayOfMonth:
      return day;
    default:
      return d;
  }
}

function computeSMA(candles: Candle[], period: number): { time: string; value: number }[] {
  if (candles.length < period) return [];
  const points: { time: string; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) points.push({ time: candles[i].date, value: sum / period });
  }
  return points;
}

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  overflow: "hidden",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 700,
    padding: "6px 13px",
    borderRadius: 7,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#0a0d13" : "var(--dim)",
  };
}

// Canvas rendering can't resolve CSS var() itself, so pull the current
// theme's actual colors at chart-creation time — keeps 상승=빨강/하락=파랑
// (this app's convention, see lib/format.ts's chgColorVar) consistent with
// whichever theme (light/dark) happens to be active, without hardcoding
// either palette here.
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// A candlestick+volume chart is a canvas-driven widget with imperative
// setup/teardown (lightweight-charts owns its own render loop) — doesn't
// fit the server-component data flow the rest of the stock page uses, so
// this fetches its own data client-side instead.
export function PriceChart({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const latestDateRef = useRef<string | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>("D");
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [chartTick, setChartTick] = useState(0);
  // 골구 근거 토글 상태 + 시그널/지지·저항 데이터 — GolgooPanel이 불러오는
  // 대로 여기로 흘러들어와서, 켜져 있으면 아래 overlay effect가 차트 위에
  // 그려준다. 이 페이지에 GolgooProvider가 없으면 useGolgoo가 던지므로,
  // app/stock/page.tsx는 항상 이 컴포넌트를 GolgooProvider 안에 둔다.
  const { open: golgooOpen, signals: golgooSignals, levels: golgooLevels } = useGolgoo();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEmpty(false);
    setHover(null);

    fetch(`/api/stock/chart?code=${code}&period=${period}`)
      .then((res) => res.json())
      .then((data: { candles?: Candle[] }) => {
        if (cancelled || !containerRef.current) return;
        const candles = data.candles ?? [];
        if (candles.length === 0) {
          setEmpty(true);
          setLoading(false);
          return;
        }

        // Period changes re-run this effect — tear down the previous
        // instance before building a new one on the same container.
        resizeObserverRef.current?.disconnect();
        chartRef.current?.remove();
        candleSeriesRef.current = null;
        markersApiRef.current = null;
        priceLinesRef.current = [];

        const upColor = cssVar("--up", "#f2434f");
        const downColor = cssVar("--down", "#3b82f6");
        const textColor = cssVar("--dim", "#8a92a3");
        const borderColor = cssVar("--border2", "rgba(255,255,255,0.12)");

        // lightweight-charts v5 doesn't default to the container's actual
        // clientWidth on its own — without an explicit width or autoSize,
        // it creates its canvases at 0 width (confirmed via a real headless
        // render: canvases existed but measured 0px wide). autoSize wires up
        // a ResizeObserver on the container so it fills the same 100%-width,
        // 360px-tall box the outer div already reserves.
        const chart = createChart(containerRef.current, {
          layout: { background: { color: "transparent" }, textColor },
          grid: { vertLines: { color: borderColor }, horzLines: { color: borderColor } },
          timeScale: {
            borderColor,
            timeVisible: false,
            tickMarkFormatter: naverTickFormatter,
            // Without these, zooming (which scales around the cursor, not
            // the data's own edges) can push the visible range past the
            // first/last candle, leaving a blank gap on one side instead of
            // the plotted candles always spanning the full width.
            fixLeftEdge: true,
            fixRightEdge: true,
          },
          rightPriceScale: { borderColor },
          autoSize: true,
          // Wheel only zooms (never scrolls, so it can't double as pan);
          // left-click-drag pans. fixLeftEdge/fixRightEdge above keep both
          // from ever pulling the chart's edges away from the actual data.
          handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
          handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: false },
        });
        chartRef.current = chart;

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor,
          downColor,
          borderUpColor: upColor,
          borderDownColor: downColor,
          wickUpColor: upColor,
          wickDownColor: downColor,
          // 국내 주가는 항상 원 단위 정수 — 네이버증권처럼 소수점 없이 "71,200" 식으로.
          priceFormat: { type: "price", precision: 0, minMove: 1 },
        });
        candleSeries.setData(
          candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        candleSeriesRef.current = candleSeries;
        markersApiRef.current = createSeriesMarkers(candleSeries, []);
        priceLinesRef.current = [];
        latestDateRef.current = candles[candles.length - 1]?.date ?? null;

        // Keyed by date so the crosshair handler below can look up each
        // MA's value at whatever bar the cursor is over — a line series only
        // has data from its own window onward (e.g. no 120일선 value for the
        // first 119 bars), so this is left sparse rather than backfilled.
        const maByDate = new Map<string, Record<number, number | undefined>>();
        for (const ma of MOVING_AVERAGES) {
          const points = computeSMA(candles, ma.period);
          if (points.length === 0) continue;
          const maSeries = chart.addSeries(LineSeries, {
            color: ma.color,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            priceFormat: { type: "price", precision: 0, minMove: 1 },
          });
          maSeries.setData(points);
          for (const p of points) {
            maByDate.set(p.time, { ...maByDate.get(p.time), [ma.period]: p.value });
          }
        }

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        volumeSeries.setData(
          candles.map((c) => ({ time: c.date, value: c.volume, color: c.close >= c.open ? upColor : downColor }))
        );

        chart.timeScale().fitContent();

        // 날짜/종가/거래량/이동평균값을 보여주는 호버 범례 — 커서가 실제로 봉 위에
        //있을 때만 뜨고, 벗어나면 사라짐.
        const byDate = new Map(candles.map((c, i) => [c.date, { c, i }] as const));
        const hoverForDate = (date: string): HoverInfo | null => {
          const found = byDate.get(date);
          if (!found) return null;
          const { c, i } = found;
          return {
            date: c.date,
            close: c.close,
            prevClose: i > 0 ? candles[i - 1].close : null,
            volume: c.volume,
            mas: maByDate.get(c.date) ?? {},
          };
        };

        chart.subscribeCrosshairMove((param) => {
          if (!param.point || !param.time) {
            setHover(null);
            return;
          }
          const date = timeToDateStr(param.time);
          const info = date ? hoverForDate(date) : null;
          setHover(info ? { info, x: param.point.x, y: param.point.y } : null);
        });

        // autoSize keeps the canvas itself full-width on resize, but doesn't
        // re-fit the visible candle range — without this, a container size
        // change (sidebar height stretch settling, window resize, font
        // reflow) leaves the existing candles at their old width, no longer
        // spanning the new one. Only fires on actual size changes, not on
        // the user's own wheel-zoom/drag (those don't resize the container),
        // so it never fights a manual zoom.
        let rafId: number | null = null;
        const resizeObserver = new ResizeObserver(() => {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => chartRef.current?.timeScale().fitContent());
        });
        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;

        setLoading(false);
        setChartTick((v) => v + 1); // lets the overlay effect below (re)draw on a fresh series
      })
      .catch(() => {
        if (!cancelled) {
          setEmpty(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, period]);

  // Unmount cleanup only — separate from the fetch effect above so a period
  // switch doesn't tear down and immediately recreate on every keystroke of
  // the effect dependency change (handled by chartRef.current?.remove() at
  // the top of the fetch effect instead).
  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      markersApiRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // 골구 근거가 켜져 있으면(golgooOpen) 지지/저항 레벨은 점선 가격선으로,
  // 오늘 활성화된 시그널은 최근 봉 위에 동그라미 마커로 그린다 — 꺼지면
  // 둘 다 지운다. chartTick은 기간(D/W/M) 전환으로 차트가 통째로 다시
  // 만들어졌을 때도 이 effect가 새 시리즈에 다시 그리도록 하는 트리거.
  useEffect(() => {
    const series = candleSeriesRef.current;
    const markersApi = markersApiRef.current;
    if (!series || !markersApi) return;

    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // series/line may already be gone if the chart was torn down mid-flight
      }
    }
    priceLinesRef.current = [];

    if (!golgooOpen) {
      markersApi.setMarkers([]);
      return;
    }

    const upColor = cssVar("--up", "#f2434f");
    const downColor = cssVar("--down", "#3b82f6");
    const dimColor = cssVar("--dim", "#8a92a3");

    if (golgooLevels) {
      for (const level of golgooLevels.slice(0, 6)) {
        const color = level.type === "support" ? downColor : level.type === "resistance" ? upColor : dimColor;
        const label = level.type === "support" ? "지지" : level.type === "resistance" ? "저항" : "지지/저항";
        try {
          const line = series.createPriceLine({
            price: level.price,
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `${label} ${level.touches}회`,
          });
          priceLinesRef.current.push(line);
        } catch {
          // stale series from a just-torn-down chart — next tick redraws
        }
      }
    }

    if (golgooSignals && golgooSignals.length > 0 && latestDateRef.current) {
      const markers: SeriesMarker<Time>[] = golgooSignals.map((s, i) => ({
        time: latestDateRef.current as Time,
        position: s.direction === "bearish" ? "belowBar" : "aboveBar",
        shape: "circle",
        color: s.direction === "bullish" ? upColor : s.direction === "bearish" ? downColor : dimColor,
        text: s.name,
        id: `golgoo-signal-${i}`,
      }));
      markersApi.setMarkers(markers);
    } else {
      markersApi.setMarkers([]);
    }
  }, [golgooOpen, golgooSignals, golgooLevels, chartTick]);

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>차트</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {MOVING_AVERAGES.map((ma) => (
              <span
                key={ma.period}
                style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--mono)", fontSize: 11, color: ma.color, fontWeight: 700 }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: ma.color }} />
                {ma.period}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 9, padding: 2 }}>
          {(Object.keys(PERIOD_LABEL) as ChartPeriod[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={tabStyle(p === period)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: "relative", minHeight: 360 }}>
        <div ref={containerRef} style={{ width: "100%", height: 360, display: loading || empty ? "none" : "block" }} />

        {hover && !loading && !empty && (() => {
          const BOX_WIDTH = 172;
          const BOX_HEIGHT = 26 * (3 + MOVING_AVERAGES.length) + 20;
          const containerWidth = containerRef.current?.clientWidth ?? 600;
          const flipX = hover.x > containerWidth - BOX_WIDTH - 20;
          const flipY = hover.y > 360 - BOX_HEIGHT - 20;
          const info = hover.info;
          return (
            <div
              style={{
                position: "absolute",
                left: flipX ? hover.x - BOX_WIDTH - 14 : hover.x + 14,
                top: flipY ? hover.y - BOX_HEIGHT - 14 : hover.y + 14,
                width: BOX_WIDTH,
                zIndex: 5,
                pointerEvents: "none",
                background: "color-mix(in srgb, var(--panel) 92%, transparent)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 14px",
                fontFamily: "var(--mono)",
                fontSize: 12,
                lineHeight: 1.9,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "var(--faint)" }}>날짜</span>
                <span style={{ fontWeight: 700 }}>{info.date}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "var(--faint)" }}>종가</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: info.prevClose === null || info.close >= info.prevClose ? "var(--up)" : "var(--down)",
                  }}
                >
                  {info.close.toLocaleString()}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "var(--faint)" }}>거래량</span>
                <span style={{ fontWeight: 700 }}>{info.volume.toLocaleString()}</span>
              </div>
              {MOVING_AVERAGES.map((ma) => {
                const v = info.mas[ma.period];
                return (
                  <div key={ma.period} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span style={{ color: ma.color }}>{ma.period}일선</span>
                    <span style={{ fontWeight: 700, color: v === undefined ? "var(--faint)" : ma.color }}>
                      {v === undefined ? "-" : Math.round(v).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {(loading || empty) && (
          <div
            style={{
              height: 360,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--faint)",
              fontSize: 13,
            }}
          >
            {loading ? "차트 불러오는 중…" : "차트 데이터를 가져오지 못했어요"}
          </div>
        )}
      </div>
    </section>
  );
}
