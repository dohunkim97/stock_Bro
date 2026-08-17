export type PerfEntry = {
  name: string;
  code: string | null;
  sector: string;
  changePct: number;
};

export type SectorStock = { name: string; code: string | null; changePct: number };

export type SectorPerformance = {
  name: string;
  avgChangePct: number;
  count: number;
  topStocks: SectorStock[];
};

// Groups entries by sector/theme and ranks by average change% — a
// "which grouping is up the most today" leaderboard, distinct from
// lib/sector-aggregation.ts's "which grouping shows up most often" count.
export function rankSectorPerformance(
  entries: PerfEntry[],
  limit = 3,
  stocksPerGroup = 2
): SectorPerformance[] {
  const byGroup = new Map<string, PerfEntry[]>();
  for (const e of entries) {
    const list = byGroup.get(e.sector);
    if (list) list.push(e);
    else byGroup.set(e.sector, [e]);
  }

  return [...byGroup.entries()]
    .map(([name, list]) => {
      const avgChangePct = list.reduce((sum, e) => sum + e.changePct, 0) / list.length;
      const topStocks = [...list]
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, stocksPerGroup)
        .map((e) => ({ name: e.name, code: e.code, changePct: e.changePct }));
      return { name, avgChangePct, count: list.length, topStocks };
    })
    .sort((a, b) => b.avgChangePct - a.avgChangePct)
    .slice(0, limit);
}

// Same stock can legitimately appear in both the gainer and volume lists
// (or loser and volume) on a given day — dedupe before averaging so it
// doesn't get double-weighted in its sector's average.
export function dedupeByStock<T extends { name: string; code: string | null }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = e.code ?? e.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
