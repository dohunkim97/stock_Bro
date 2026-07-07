export function formatChg(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export function chgColorVar(pct: number): string {
  return pct >= 0 ? "var(--up)" : "var(--down)";
}

export function chgArrow(pct: number): string {
  return pct >= 0 ? "▲" : "▼";
}
