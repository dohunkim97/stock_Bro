"use client";

import { useGolgoo } from "./golgoo-context";

// Sits next to WatchlistButton in the title row — only rendered when this
// stock is actually one of Golgoo's current picks (GolgooProvider's
// `available`), so it never shows up as a dead button on unrelated stocks.
export function GolgooEvidenceButton() {
  const { available, open, toggle } = useGolgoo();
  if (!available) return null;

  return (
    <button
      onClick={toggle}
      aria-pressed={open}
      title="골구가 이 종목을 추천한 근거와 차트 시그널 보기"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: open ? "var(--accent)" : "var(--panel)",
        color: open ? "#0a0d13" : "var(--dim)",
        border: `1px solid ${open ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: "7px 12px",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      🥚 골구 근거
    </button>
  );
}
