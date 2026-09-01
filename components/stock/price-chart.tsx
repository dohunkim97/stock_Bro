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
import type { SupportResistanceLevel } from "@/lib/technical-signals";

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

type Role = "support" | "resistance";

type PickedLevel = { level: SupportResistanceLevel; role: Role; isKey: boolean };

type LevelSummary = {
  role: Role;
  price: number;
  touches: number;
  color: string;
  isKey: boolean;
  text: string;
};

type TouchPoint = { id: string; x: number; y: number; index: number; color: string };

const MOVING_AVERAGES: { period: number; color: string }[] = [
  { period: 5, color: "#f59e0b" },
  { period: 60, color: "#22c55e" },
  { period: 200, color: "#9ca3af" },
];

// 국내 주가 표기 관례("71,200") — lightweight-charts 기본 포맷은 콤마를 안
// 찍어줘서 커스텀 포매터로 교체한다. 캔들/이동평균선 시리즈 전부 같은
// 오른쪽 가격축을 공유하니 포맷도 통일해야 눈금이 어긋나 보이지 않는다.
function priceFormatter(price: number): string {
  return Math.round(price).toLocaleString();
}

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

// 지지/저항은 "지금 가격 대비 어디에 있는지"가 핵심이라, 과거에 아무리 많이
// 부딪힌 레벨이라도 지금 가격과 동떨어져 있으면 당장의 매수/매도 판단에는
// 안 쓸모가 없다 — 현재가에 가장 가까운 지지선 1개 + 저항선 1개를 우선
// 고르고, 그다음으로 터치가 많아 신뢰도 높은 레벨 하나를 더 얹는다(최대 3개).
// 역할(지지/저항)도 레벨 자체의 과거 타입이 아니라 "지금 가격보다 위냐
// 아래냐"로 다시 정한다 — 저항이 뚫리면 지지가 되고 그 반대도 마찬가지라는
// 실제 지지/저항 개념과 일치시키기 위함.
function pickRelevantLevels(levels: SupportResistanceLevel[], currentPrice: number | null): PickedLevel[] {
  if (levels.length === 0) return [];

  const withRole: { level: SupportResistanceLevel; role: Role }[] = levels.map((level) => ({
    level,
    role:
      currentPrice === null
        ? level.type === "support"
          ? "support"
          : "resistance"
        : level.price > currentPrice
          ? "resistance"
          : "support",
  }));

  const supports = withRole.filter((x) => x.role === "support").sort((a, b) => b.level.price - a.level.price);
  const resistances = withRole.filter((x) => x.role === "resistance").sort((a, b) => a.level.price - b.level.price);

  const picked: { level: SupportResistanceLevel; role: Role }[] = [];
  if (supports[0]) picked.push(supports[0]);
  if (resistances[0]) picked.push(resistances[0]);

  const secondCandidates = [supports[1], resistances[1]].filter(
    (x): x is { level: SupportResistanceLevel; role: Role } => !!x
  );
  secondCandidates.sort((a, b) => b.level.touches - a.level.touches);
  if (secondCandidates[0]) picked.push(secondCandidates[0]);

  if (picked.length === 0) return [];
  let keyIdx = 0;
  for (let i = 1; i < picked.length; i++) {
    if (picked[i].level.touches > picked[keyIdx].level.touches) keyIdx = i;
  }
  return picked.map((p, i) => ({ ...p, isKey: i === keyIdx }));
}

function roleLabel(role: Role): string {
  return role === "support" ? "지지선" : "저항선";
}

// "많이 지지 받을수록 강한 거고, 저항도 많이 부딪히고 못 뚫으면 강력한
// 저항"이라는 규칙을 그대로 문구로 옮긴다.
function strengthLabel(role: Role, touches: number): string {
  const word = role === "support" ? "지지" : "저항";
  if (touches >= 3) return `강력한 ${word}받는중`;
  if (touches === 2) return `${word} 확인 중`;
  return `약한 ${word}`;
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
  const latestCloseRef = useRef<number | null>(null);
  const pickedLevelsRef = useRef<PickedLevel[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>("D");
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [chartTick, setChartTick] = useState(0);
  const [levelSummaries, setLevelSummaries] = useState<LevelSummary[]>([]);
  const [touchPoints, setTouchPoints] = useState<TouchPoint[]>([]);
  const recomputeTouchPointsRef = useRef<() => void>(() => {});
  // 골구 근거 토글 상태 + 시그널/지지·저항 데이터 — GolgooPanel이 불러오는
  // 대로 여기로 흘러들어와서, 켜져 있으면 아래 overlay effect가 차트 위에
  // 그려준다. 이 페이지에 GolgooProvider가 없으면 useGolgoo가 던지므로,
  // app/stock/page.tsx는 항상 이 컴포넌트를 GolgooProvider 안에 둔다.
  // 골구 근거(candidate-gated)와 골구 차트분석(누구든 가능) 둘 다 같은
  // 오버레이를 그릴 수 있어서, 실제로 열려 있는 쪽 데이터를 그대로 쓴다 —
  // 골구 근거 쪽이 더 풍부한 데이터(전략가이드 등과 같이 계산됨)라 두 개가
  // 동시에 열려 있으면 그쪽을 우선한다.
  const {
    open: golgooOpen,
    signals: golgooSignals,
    levels: golgooLevels,
    chartOpen,
    chartSignals,
    chartLevels,
  } = useGolgoo();
  const overlayOpen = golgooOpen || chartOpen;
  const overlaySignals = golgooOpen ? golgooSignals : chartSignals;
  const overlayLevels = golgooOpen ? golgooLevels : chartLevels;

  // 지지/저항선에 실제로 찍힌 터치 지점(빈 동그라미)의 화면 좌표를 다시
  // 계산한다 — 팬/줌/리사이즈될 때마다 다시 불러야 해서 ref로 최신 버전을
  // 항상 들고 있는다. 번호는 과거→최근 순으로(1회, 2회, …) 매기고, 화면이
  // 붐비지 않게 레벨당 최근 6개까지만 그린다(번호 자체는 실제 누적 횟수를
  // 그대로 유지 — 6개 넘게 터치된 레벨이면 "3회, 4회, 5회…"처럼 이어진다).
  function recomputeTouchPoints() {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const picked = pickedLevelsRef.current;
    if (!chart || !series || !overlayOpen || picked.length === 0) {
      setTouchPoints([]);
      return;
    }

    const upColor = cssVar("--up", "#f2434f");
    const downColor = cssVar("--down", "#3b82f6");

    const points: TouchPoint[] = [];
    for (const p of picked) {
      const color = p.role === "support" ? downColor : upColor;
      const chronological = [...p.level.touchDates].sort(); // touchDates는 최신순 저장이라 오래된 순으로 뒤집는다.
      const displayed = chronological.slice(-6);
      const startIndex = chronological.length - displayed.length + 1;
      displayed.forEach((date, i) => {
        const x = chart.timeScale().timeToCoordinate(date as Time);
        const y = series.priceToCoordinate(p.level.price);
        if (x === null || y === null) return;
        points.push({ id: `${p.level.price}-${date}`, x: x as number, y: y as number, index: startIndex + i, color });
      });
    }
    setTouchPoints(points);
  }
  recomputeTouchPointsRef.current = recomputeTouchPoints;

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
          // 국내 주가는 항상 원 단위 정수 — 네이버증권처럼 "71,200"처럼 콤마 포함.
          priceFormat: { type: "custom", formatter: priceFormatter, minMove: 1 },
        });
        candleSeries.setData(
          candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        candleSeriesRef.current = candleSeries;
        markersApiRef.current = createSeriesMarkers(candleSeries, []);
        priceLinesRef.current = [];
        latestDateRef.current = candles[candles.length - 1]?.date ?? null;
        latestCloseRef.current = candles[candles.length - 1]?.close ?? null;

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
            priceFormat: { type: "custom", formatter: priceFormatter, minMove: 1 },
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

        // 팬/줌으로 시간축이 바뀌면 터치 지점(동그라미)의 화면 좌표도 다시
        // 계산해야 한다 — ref로 항상 최신 recomputeTouchPoints를 부른다.
        chart.timeScale().subscribeVisibleLogicalRangeChange(() => recomputeTouchPointsRef.current());

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
          rafId = requestAnimationFrame(() => {
            chartRef.current?.timeScale().fitContent();
            recomputeTouchPointsRef.current();
          });
        });
        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;

        setLoading(false);
        setChartTick((v) => v + 1); // lets the overlay effect below (re)draw on a fresh series
        recomputeTouchPointsRef.current();
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

  // 골구 근거 또는 골구 차트분석 둘 중 하나라도 켜져 있으면(overlayOpen)
  // 지지/저항 레벨은 실선 가격선으로, 오늘 활성화된 시그널은 최근 봉 위에
  // 동그라미 마커로 그린다 — 둘 다 꺼지면 지운다. chartTick은 기간(D/W/M)
  // 전환으로 차트가 통째로 다시 만들어졌을 때도 이 effect가 새 시리즈에
  // 다시 그리도록 하는 트리거.
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

    if (!overlayOpen) {
      markersApi.setMarkers([]);
      pickedLevelsRef.current = [];
      setLevelSummaries([]);
      setTouchPoints([]);
      return;
    }

    const upColor = cssVar("--up", "#f2434f");
    const downColor = cssVar("--down", "#3b82f6");
    const dimColor = cssVar("--dim", "#8a92a3");
    const roleColor = (role: Role) => (role === "support" ? downColor : upColor);

    const picked = overlayLevels ? pickRelevantLevels(overlayLevels, latestCloseRef.current) : [];
    pickedLevelsRef.current = picked;

    setLevelSummaries(
      picked.map((p) => ({
        role: p.role,
        price: p.level.price,
        touches: p.level.touches,
        color: roleColor(p.role),
        isKey: p.isKey,
        text: `${roleLabel(p.role)} ${priceFormatter(p.level.price)}원 · ${p.level.touches}회 터치 · ${strengthLabel(p.role, p.level.touches)}`,
      }))
    );

    // 라인 자체는 실선만 — 라벨은 축 옆에 겹쳐 쌓이는 대신 차트 위쪽
    // 요약 줄(levelSummaries 렌더링)에서 보여준다.
    for (const p of picked) {
      try {
        const line = series.createPriceLine({
          price: p.level.price,
          color: roleColor(p.role),
          lineWidth: p.isKey ? 3 : 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: false,
        });
        priceLinesRef.current.push(line);
      } catch {
        // stale series from a just-torn-down chart — next tick redraws
      }
    }

    const markers: SeriesMarker<Time>[] = [];

    // 오늘 기준으로 활성화된 시그널(거래량/이동평균선 등)은 최근 봉 위에
    // 동그라미로 — 위 지지/저항 터치(빈 동그라미, HTML로 따로 그림)와 구분되게 둔다.
    if (overlaySignals && overlaySignals.length > 0 && latestDateRef.current) {
      for (const s of overlaySignals) {
        markers.push({
          time: latestDateRef.current as Time,
          position: s.direction === "bearish" ? "belowBar" : "aboveBar",
          shape: "circle",
          color: s.direction === "bullish" ? upColor : s.direction === "bearish" ? downColor : dimColor,
          text: s.name,
          id: `golgoo-signal-${s.name}`,
        });
      }
    }

    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    markersApi.setMarkers(markers);
    recomputeTouchPoints();
  }, [overlayOpen, overlaySignals, overlayLevels, chartTick]);

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

      {levelSummaries.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            padding: "10px 18px",
            borderBottom: "1px solid var(--border)",
            background: "var(--panel2)",
          }}
        >
          {levelSummaries.map((s) => (
            <div key={`${s.role}-${s.price}`} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: s.color,
                  flexShrink: 0,
                  boxShadow: s.isKey ? `0 0 0 3px color-mix(in srgb, ${s.color} 25%, transparent)` : undefined,
                }}
              />
              <span style={{ fontWeight: s.isKey ? 800 : 600, color: "var(--text)" }}>{s.text}</span>
              {s.isKey && (
                <span style={{ fontSize: 10, fontWeight: 700, color: s.color, fontFamily: "var(--mono)" }}>핵심</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ position: "relative", minHeight: 360 }}>
        <div ref={containerRef} style={{ width: "100%", height: 360, display: loading || empty ? "none" : "block" }} />

        {!loading &&
          !empty &&
          touchPoints.map((pt) => (
            <div
              key={pt.id}
              title={`${pt.index}회 터치`}
              style={{
                position: "absolute",
                left: pt.x - 7,
                top: pt.y - 7,
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: `2px solid ${pt.color}`,
                background: "var(--panel)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 3,
                pointerEvents: "none",
              }}
            >
              <span style={{ fontSize: 8, fontWeight: 800, color: pt.color, fontFamily: "var(--mono)" }}>
                {pt.index}
              </span>
            </div>
          ))}

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
