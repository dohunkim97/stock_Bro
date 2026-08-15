"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi } from "lightweight-charts";

type ChartPeriod = "D" | "W" | "M";
const PERIOD_LABEL: Record<ChartPeriod, string> = { D: "일봉", W: "주봉", M: "월봉" };

type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };

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
  const [period, setPeriod] = useState<ChartPeriod>("D");
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEmpty(false);

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
        chartRef.current?.remove();

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
          timeScale: { borderColor, timeVisible: false },
          rightPriceScale: { borderColor },
          autoSize: true,
        });
        chartRef.current = chart;

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor,
          downColor,
          borderUpColor: upColor,
          borderDownColor: downColor,
          wickUpColor: upColor,
          wickDownColor: downColor,
        });
        candleSeries.setData(
          candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close }))
        );

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        volumeSeries.setData(
          candles.map((c) => ({ time: c.date, value: c.volume, color: c.close >= c.open ? upColor : downColor }))
        );

        chart.timeScale().fitContent();
        setLoading(false);
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
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, []);

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
        <span style={{ fontWeight: 700, fontSize: 15 }}>차트</span>
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
