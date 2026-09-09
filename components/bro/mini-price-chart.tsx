"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type { ChartCandle } from "@/lib/kis-chart";
import type { ChartDetail } from "@/lib/field-detail";

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const STEP_CIRCLE = ["①", "②", "③", "④", "⑤"];

// 골구 근거 "차트" 항목을 클릭했을 때 뜨는 심층 모달 전용 미니 차트 —
// components/stock/price-chart.tsx의 이동평균선/호버 범례 등 무거운 기능
// 없이, 지지/저항선 + 오늘 활성화된 시그널 + 차트 스토리(①②③)만 그린다.
// GolgooContext에 의존하지 않는 독립 컴포넌트라 이 모달 안에서만 쓴다.
export function MiniPriceChart({ candles, buyTiming, story }: Pick<ChartDetail, "candles" | "buyTiming" | "story">) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const upColor = cssVar("--up", "#f2434f");
    const downColor = cssVar("--down", "#3b82f6");
    const accentColor = cssVar("--accent", "#e0aa3e");
    const textColor = cssVar("--dim", "#8a92a3");
    const borderColor = cssVar("--border2", "rgba(255,255,255,0.12)");

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor },
      grid: { vertLines: { color: borderColor }, horzLines: { color: borderColor } },
      timeScale: { borderColor, timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      rightPriceScale: { borderColor },
      autoSize: true,
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
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    candleSeries.setData(candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close })));

    const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeries.setData(
      candles.map((c) => ({ time: c.date, value: c.volume, color: c.close >= c.open ? upColor : downColor }))
    );

    // 아래 "매수타이밍" 카드와 정확히 같은 숫자를 그린다 — 터치 횟수 1위인
    // 레벨을 그냥 그리면(예전 방식) 지금 가격과 동떨어진 옛날 레벨이 나올 수
    // 있어서(실측: 후성이 1년 전 4,590원대를 "핵심 저항선"으로 잘못 표시),
    // lib/field-detail.ts가 이미 현재가 기준으로 골라둔 support/resistance를
    // 그대로 쓴다.
    if (buyTiming.support !== null) {
      try {
        candleSeries.createPriceLine({
          price: buyTiming.support,
          color: downColor,
          lineWidth: 3,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "지지선",
        });
      } catch {
        // ignore
      }
    }
    if (buyTiming.resistance !== null) {
      try {
        candleSeries.createPriceLine({
          price: buyTiming.resistance,
          color: upColor,
          lineWidth: 3,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "저항선",
        });
      } catch {
        // ignore
      }
    }

    const markers: SeriesMarker<Time>[] = story.map((ev) => ({
      time: ev.date as Time,
      position: ev.direction === "bearish" ? "belowBar" : "aboveBar",
      shape: ev.type === "GOLDEN_CROSS" ? "arrowUp" : "circle",
      color: ev.direction === "bullish" ? upColor : ev.direction === "bearish" ? downColor : accentColor,
      text: STEP_CIRCLE[ev.stepNumber - 1] ?? String(ev.stepNumber),
      id: `story-${ev.stepNumber}`,
    }));
    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    createSeriesMarkers(candleSeries, markers);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (candles.length === 0) {
    return <div style={{ padding: "30px 0", textAlign: "center", color: "var(--faint)", fontSize: 12.5 }}>차트 데이터가 없어요.</div>;
  }

  return <div ref={containerRef} style={{ width: "100%", height: 320 }} />;
}

export type { ChartCandle };
