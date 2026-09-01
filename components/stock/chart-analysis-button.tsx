"use client";

import { useEffect, useState } from "react";
import { useGolgoo } from "./golgoo-context";

// Unlike GolgooEvidenceButton, this always renders — technical chart
// analysis (지지/저항선 + 시그널 + 스토리) is pure price-data math, not tied
// to whether Golgoo happens to be recommending this particular stock.
// Fetches on toggle-open itself (no separate side panel anymore — the
// numbered ①②③ story used to also list out in a panel next to the chart,
// but PriceChart now draws each point's explanation directly on the chart
// as a callout box, so a redundant list panel isn't needed).
export function ChartAnalysisButton({ code }: { code: string }) {
  const { chartOpen, toggleChart, setChartOverlay } = useGolgoo();
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!chartOpen || fetched || loading) return;
    setLoading(true);
    fetch(`/api/stock/chart-analysis?code=${code}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        setChartOverlay(
          Array.isArray(data.signals) ? data.signals : [],
          Array.isArray(data.levels) ? data.levels : [],
          Array.isArray(data.story) ? data.story : []
        );
        setFetched(true);
      })
      .catch(() => {
        // best-effort — chart just stays without overlays if this fails
      })
      .finally(() => setLoading(false));
  }, [chartOpen, fetched, loading, code, setChartOverlay]);

  return (
    <button
      onClick={toggleChart}
      aria-pressed={chartOpen}
      title="이 종목의 지지/저항선과 기술적 시그널을 차트에 표시"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: chartOpen ? "var(--accent)" : "var(--panel)",
        color: chartOpen ? "#0a0d13" : "var(--dim)",
        border: `1px solid ${chartOpen ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: "7px 12px",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "📊 분석 중…" : "📊 골구 차트분석"}
    </button>
  );
}
