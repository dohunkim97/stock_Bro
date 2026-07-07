export type SectorEntry = {
  name: string;
  code: string | null;
  sector: string;
  changePct: number;
};

export type SectorBar = {
  name: string;
  count: number;
  pct: number;
  width: number;
};

export type HotSectorResult = {
  hasData: boolean;
  totalCount: number;
  hotSector: string | null;
  hotSectorCount: number;
  sectors: SectorBar[];
  contributors: SectorEntry[];
};

export function aggregateSectors(entries: SectorEntry[]): HotSectorResult {
  if (entries.length === 0) {
    return {
      hasData: false,
      totalCount: 0,
      hotSector: null,
      hotSectorCount: 0,
      sectors: [],
      contributors: [],
    };
  }

  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.sector, (counts.get(e.sector) ?? 0) + 1);
  }

  const total = entries.length;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = ranked[0][1];

  const sectors: SectorBar[] = ranked.map(([name, count]) => ({
    name,
    count,
    pct: Math.round((count / total) * 100),
    width: Math.max(8, Math.round((count / maxCount) * 100)),
  }));

  const hotSector = ranked[0][0];
  const seen = new Set<string>();
  const contributors = entries
    .filter((e) => e.sector === hotSector)
    .filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true)))
    .sort((a, b) => b.changePct - a.changePct);

  return {
    hasData: true,
    totalCount: total,
    hotSector,
    hotSectorCount: ranked[0][1],
    sectors,
    contributors,
  };
}
