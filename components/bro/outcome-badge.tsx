import type { OutcomeKind } from "@/lib/prediction-outcome";

// 예상종목 결과 배지 — 주간/월간 리포트, 기록보관소 카드, 종목 카드가 다 같은
// 모양·같은 문구를 쓰게 한 곳에 둔다. 훅/상태 없는 순수 컴포넌트라 서버/
// 클라이언트 컴포넌트 어디서든 import 가능.
const CONFIG: Record<OutcomeKind, { fg: string; bg: string; label: string }> = {
  TARGET: { fg: "var(--up)", bg: "var(--up-soft)", label: "🎯 목표 도달" },
  STOP: { fg: "var(--down)", bg: "var(--down-soft)", label: "🛑 손절" },
  TIMEOUT: { fg: "var(--dim)", bg: "var(--panel2)", label: "⏱ 기간 종료" },
  AMBIGUOUS: { fg: "var(--accent)", bg: "var(--accent-soft)", label: "❓ 판정 불가" },
  UNRATED: { fg: "var(--faint)", bg: "var(--panel2)", label: "목표·손절 미저장" },
};

export function OutcomeBadge({ outcome, day }: { outcome: OutcomeKind; day?: number | null }) {
  const cfg = CONFIG[outcome];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        color: cfg.fg,
        background: cfg.bg,
        borderRadius: 20,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
      {day ? ` · ${day}일차` : ""}
    </span>
  );
}

export function fmtSigned(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function pnlColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return "var(--faint)";
  return v >= 0 ? "var(--up)" : "var(--down)";
}
