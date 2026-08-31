"use client";

import { useGolgoo } from "./golgoo-context";

// Unlike GolgooEvidenceButton, this always renders — technical chart
// analysis (지지/저항선 + 시그널 + 스토리) is pure price-data math, not tied
// to whether Golgoo happens to be recommending this particular stock.
export function ChartAnalysisButton() {
  const { chartOpen, toggleChart } = useGolgoo();

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
      }}
    >
      📊 골구 차트분석
    </button>
  );
}
