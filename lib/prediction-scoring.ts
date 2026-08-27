// Pure scoring/DB logic for WeeklyPrediction, deliberately kept free of any
// dependency on lib/bro-context.ts or lib/weekly-prediction.ts — both of
// those need functions from here (chat context needs the track record;
// generation needs it to inform the next prediction), and either of them
// importing the other would be circular. This file imports neither.

import { prisma } from "@/lib/prisma";
import { fetchKisChart } from "@/lib/kis-chart";
import { getDailyChangeSeries, TRACKING_WINDOW_DAYS } from "@/lib/candidate-tracking";
import { formatDateLabel, todayISO } from "@/lib/dates";

export type SectorPrediction = { name: string; reasoning: string };
export type CandidatePrediction = { name: string; code?: string; reasoning: string };

type RawItem = Record<string, unknown>;

function isSectorLike(x: unknown): x is SectorPrediction {
  return !!x && typeof x === "object" && typeof (x as RawItem).name === "string" && typeof (x as RawItem).reasoning === "string";
}

export function parsePredictionSectors(raw: string): SectorPrediction[] {
  try {
    const p: unknown = JSON.parse(raw);
    if (Array.isArray(p)) return p.filter(isSectorLike);
  } catch {
    // ignore
  }
  return [];
}

export function parsePredictionCandidates(raw: string): CandidatePrediction[] {
  try {
    const p: unknown = JSON.parse(raw);
    if (Array.isArray(p)) {
      return p.filter(isSectorLike).map((c) => {
        const r = c as unknown as RawItem;
        return {
          name: c.name,
          reasoning: c.reasoning,
          code: typeof r.code === "string" ? (r.code as string) : undefined,
        };
      });
    }
  } catch {
    // ignore
  }
  return [];
}

export type ScoredSector = SectorPrediction & { hit: boolean };
export type ScoredCandidate = CandidatePrediction & { hit: boolean; finalChangePct: number | null };

export type ScoredPrediction = {
  forDate: string;
  label: string;
  summary: string;
  sectors: ScoredSector[];
  candidates: ScoredCandidate[];
  sectorHitRate: number | null;
  candidateHitRate: number | null;
  actualHotSector: string | null;
};

type PredictionRow = { forDate: string; summary: string; sectors: string; candidates: string };

// The 5 trading dates following forDate — used both to know whether a row
// is old enough to fully score yet, and (for sectors) to look up which
// sectors actually led over that same window.
async function tradingDaysAfter(forDate: string, count: number): Promise<string[]> {
  const rows = await prisma.dailyEntry.findMany({
    where: { date: { gt: forDate } },
    distinct: ["date"],
    orderBy: { date: "asc" },
    select: { date: true },
    take: count,
  });
  return rows.map((r) => r.date);
}

// Only scoreable once forDate's 5-trading-day window has actually finished
// (5 real trading dates with synced data exist after it) — a window still
// in progress, or one with no synced data yet, just isn't judgeable, so
// this returns null rather than falsely scoring it 0%.
export async function scorePrediction(row: PredictionRow): Promise<ScoredPrediction | null> {
  const windowDates = await tradingDaysAfter(row.forDate, TRACKING_WINDOW_DAYS);
  if (windowDates.length < TRACKING_WINDOW_DAYS) return null;
  const windowEnd = windowDates[windowDates.length - 1];

  const entries = await prisma.dailyEntry.findMany({ where: { date: { gte: row.forDate, lte: windowEnd } } });
  if (entries.length === 0) return null;

  const bySector = new Map<string, { sum: number; count: number }>();
  for (const e of entries) {
    const b = bySector.get(e.sector) ?? { sum: 0, count: 0 };
    b.sum += e.changePct;
    b.count += 1;
    bySector.set(e.sector, b);
  }
  const topSectors = [...bySector.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([name]) => name);

  const sectors: ScoredSector[] = parsePredictionSectors(row.sectors).map((s) => ({
    ...s,
    hit: topSectors.some((actual) => actual.includes(s.name) || s.name.includes(actual)),
  }));

  const rawCandidates = parsePredictionCandidates(row.candidates);
  const candidates: ScoredCandidate[] = await Promise.all(
    rawCandidates.map(async (c) => {
      if (!c.code) return { ...c, hit: false, finalChangePct: null };
      const candles = await fetchKisChart(c.code, "D");
      const series = getDailyChangeSeries(candles, row.forDate);
      const final = series.length > 0 ? series[series.length - 1].changePct : null;
      return { ...c, hit: final !== null && final > 0, finalChangePct: final };
    })
  );

  const sectorCounts = [...bySector.entries()].sort((a, b) => b[1].count - a[1].count);

  return {
    forDate: row.forDate,
    label: formatDateLabel(row.forDate),
    summary: row.summary,
    sectors,
    candidates,
    sectorHitRate: sectors.length ? sectors.filter((s) => s.hit).length / sectors.length : null,
    candidateHitRate: candidates.length ? candidates.filter((c) => c.hit).length / candidates.length : null,
    actualHotSector: sectorCounts[0]?.[0] ?? null,
  };
}

// Strictly-scored history (5-trading-day window fully elapsed) — used to
// tell Golgoo/the LLM how accurate past calls actually were. For a
// day-by-day archive listing that also includes still-in-progress rows,
// see getRecentPredictionDays below instead.
export async function getScoredPredictionHistory(limit = 8): Promise<ScoredPrediction[]> {
  const rows = await prisma.weeklyPrediction.findMany({ orderBy: { createdAt: "desc" }, take: limit + 6 });
  const scored: ScoredPrediction[] = [];
  for (const r of rows) {
    const s = await scorePrediction(r);
    if (s) scored.push(s);
    if (scored.length >= limit) break;
  }
  return scored;
}

export async function getLatestPrediction() {
  return prisma.weeklyPrediction.findFirst({ orderBy: { createdAt: "desc" } });
}

export type PredictionDay = {
  forDate: string;
  label: string;
  summary: string;
  sectors: SectorPrediction[];
  candidates: (CandidatePrediction & { series: Awaited<ReturnType<typeof getDailyChangeSeries>> })[];
};

// Every past prediction day, most recent first, each candidate carrying
// whatever cumulative-return data is available right now (1-5 days —
// however much of the 5-trading-day window has actually elapsed since
// forDate) — unlike getScoredPredictionHistory, this doesn't wait for the
// window to fully finish, so yesterday's report shows up with its
// in-progress return instead of only appearing once it's 5 days old.
export async function getRecentPredictionDays(limit = 14): Promise<PredictionDay[]> {
  const rows = await prisma.weeklyPrediction.findMany({
    where: { forDate: { lt: todayISO() } },
    orderBy: { forDate: "desc" },
    take: limit,
  });

  return Promise.all(
    rows.map(async (row) => {
      const candidates = parsePredictionCandidates(row.candidates);
      const withSeries = await Promise.all(
        candidates.map(async (c) => {
          const candles = c.code ? await fetchKisChart(c.code, "D") : [];
          return { ...c, series: getDailyChangeSeries(candles, row.forDate) };
        })
      );
      return {
        forDate: row.forDate,
        label: formatDateLabel(row.forDate),
        summary: row.summary,
        sectors: parsePredictionSectors(row.sectors),
        candidates: withSeries,
      };
    })
  );
}
