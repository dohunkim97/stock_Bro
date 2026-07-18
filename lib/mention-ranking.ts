import type { DailyEntry } from "@/app/generated/prisma/client";

export type MentionRow = {
  name: string;
  code: string | null;
  sector: string;
  market: string | null;
  count: number;
  avgChangePct: number;
};

// How often a stock showed up across the recent 상승 TOP / 거래 TOP rankings —
// our own stand-in for "가장 많이 언급된 종목" since there's no external
// news/social mention source wired in yet.
export function rankMostMentioned(entries: DailyEntry[], limit = 10): MentionRow[] {
  const byName = new Map<string, { entry: DailyEntry; count: number; changeSum: number }>();

  for (const e of entries) {
    const existing = byName.get(e.name);
    if (existing) {
      existing.count += 1;
      existing.changeSum += e.changePct;
    } else {
      byName.set(e.name, { entry: e, count: 1, changeSum: e.changePct });
    }
  }

  return [...byName.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ entry, count, changeSum }) => ({
      name: entry.name,
      code: entry.code,
      sector: entry.sector,
      market: entry.market,
      count,
      avgChangePct: changeSum / count,
    }));
}
