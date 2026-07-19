export function formatChg(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export function chgColorVar(pct: number): string {
  return pct >= 0 ? "var(--up)" : "var(--down)";
}

export function chgArrow(pct: number): string {
  return pct >= 0 ? "▲" : "▼";
}

export function formatWon(value: number): string {
  const EOK = 100_000_000;
  const JO = EOK * 10_000;
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value >= JO) {
    const jo = Math.floor(value / JO);
    const eok = Math.round((value % JO) / EOK);
    return eok > 0 ? `${jo}조 ${eok.toLocaleString()}억` : `${jo}조`;
  }
  if (value >= EOK) return `${Math.round(value / EOK).toLocaleString()}억`;
  return `${value.toLocaleString()}원`;
}
