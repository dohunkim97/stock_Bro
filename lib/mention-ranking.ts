import type { DailyEntry } from "@/app/generated/prisma/client";

export type MentionOccurrence = {
  date: string;
  listType: string;
  rank: number;
  changePct: number;
};

export type MentionRow = {
  name: string;
  code: string | null;
  sector: string;
  market: string | null;
  count: number;
  avgChangePct: number;
  occurrences: MentionOccurrence[];
};

// How often a stock showed up across the recent 상승 TOP / 거래 TOP rankings —
// our own stand-in for "가장 많이 언급된 종목" since there's no external
// news/social mention source wired in yet. Keeping each occurrence (not
// just the count) lets the UI show *when* and *where* it showed up, which
// is real, honest context even without an actual news/공시 source to
// explain *why*.
export function rankMostMentioned(entries: DailyEntry[], limit = 10): MentionRow[] {
  const byName = new Map<
    string,
    { entry: DailyEntry; count: number; changeSum: number; occurrences: MentionOccurrence[] }
  >();

  for (const e of entries) {
    const occurrence: MentionOccurrence = {
      date: e.date,
      listType: e.listType,
      rank: e.rank,
      changePct: e.changePct,
    };
    const existing = byName.get(e.name);
    if (existing) {
      existing.count += 1;
      existing.changeSum += e.changePct;
      existing.occurrences.push(occurrence);
    } else {
      byName.set(e.name, { entry: e, count: 1, changeSum: e.changePct, occurrences: [occurrence] });
    }
  }

  return [...byName.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ entry, count, changeSum, occurrences }) => ({
      name: entry.name,
      code: entry.code,
      sector: entry.sector,
      market: entry.market,
      count,
      avgChangePct: changeSum / count,
      occurrences: occurrences.sort((a, b) => a.date.localeCompare(b.date)),
    }));
}
