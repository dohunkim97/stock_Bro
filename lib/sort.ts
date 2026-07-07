import type { DailyEntry } from "@/app/generated/prisma/client";

export function parseLeadingNumber(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return Number.NEGATIVE_INFINITY;
  let n = parseFloat(match[0]);
  // Crude unit scaling so "1.2조" sorts above "900억" — good enough for
  // display-oriented text fields that aren't stored as raw numbers.
  if (cleaned.includes("조")) n *= 1_0000_0000; // relative to 억 units
  return n;
}

export type SortOption = {
  key: string;
  label: string;
  getValue: (e: DailyEntry) => number;
};

export const SORT_OPTIONS: SortOption[] = [
  { key: "rank", label: "기본순", getValue: (e) => -e.rank },
  { key: "price", label: "현재가순", getValue: (e) => parseLeadingNumber(e.price) },
  { key: "changePct", label: "등락률순", getValue: (e) => e.changePct },
  { key: "volume", label: "거래량순", getValue: (e) => parseLeadingNumber(e.volume) },
  { key: "tradingValue", label: "거래대금순", getValue: (e) => parseLeadingNumber(e.tradingValue) },
  { key: "marketCap", label: "시가총액순", getValue: (e) => parseLeadingNumber(e.marketCap) },
  { key: "per", label: "PER순", getValue: (e) => parseLeadingNumber(e.per) },
  { key: "pbr", label: "PBR순", getValue: (e) => parseLeadingNumber(e.pbr) },
  { key: "roe", label: "ROE순", getValue: (e) => parseLeadingNumber(e.roe) },
  { key: "debtRatio", label: "부채비율순", getValue: (e) => parseLeadingNumber(e.debtRatio) },
  { key: "reserveRatio", label: "유보율순", getValue: (e) => parseLeadingNumber(e.reserveRatio) },
];

export function sortEntries(entries: DailyEntry[], sortKey: string): DailyEntry[] {
  const option = SORT_OPTIONS.find((o) => o.key === sortKey) ?? SORT_OPTIONS[0];
  return [...entries].sort((a, b) => option.getValue(b) - option.getValue(a));
}
