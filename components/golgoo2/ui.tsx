// 골구2 화면 전용 작은 프레젠테이션 컴포넌트 — app/bottom-fish-preview/page.tsx의
// Card/Badge/Metric 패턴을 그대로 따르되, 골구2만의 파일로 독립시켰다(기존 파일
// 공유 안 함 — 두 기법의 화면 코드가 서로 얽히지 않도록).
"use client";

import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px" }}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "accent" }) {
  const color = tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : tone === "accent" ? "var(--accent)" : "var(--text)";
  return (
    <Card>
      <div style={{ fontSize: 12, color: "var(--dim)" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, marginTop: 4, color }}>{value}</div>
    </Card>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone: "ok" | "warn" | "dim" }) {
  const colors = {
    ok: { bg: "var(--down-soft)", fg: "var(--down)" },
    warn: { bg: "var(--up-soft)", fg: "var(--up)" },
    dim: { bg: "var(--panel2)", fg: "var(--dim)" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: colors.bg,
        color: colors.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--dim)" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
