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
  const MAN = 10_000;
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value >= JO) {
    const jo = Math.floor(value / JO);
    const eok = Math.round((value % JO) / EOK);
    return eok > 0 ? `${jo}조 ${eok.toLocaleString()}억` : `${jo}조`;
  }
  if (value >= EOK) return `${Math.round(value / EOK).toLocaleString()}억`;
  // 억 밑으로는 "35,000,000원" 대신 "3,500만원"처럼 만 단위로 — 천만/백만대
  // 금액도 이 안에서 자연스럽게 표현된다 (예: 800만원, 3,500만원).
  if (value >= MAN) return `${Math.round(value / MAN).toLocaleString()}만원`;
  return `${value.toLocaleString()}원`;
}
