// Pure scoring/DB logic for WeeklyPrediction, deliberately kept free of any
// dependency on lib/bro-context.ts or lib/weekly-prediction.ts — both of
// those need functions from here (chat context needs the track record;
// generation needs it to inform the next prediction), and either of them
// importing the other would be circular. This file imports neither.

import { prisma } from "@/lib/prisma";
import { getEntriesInRange } from "@/lib/market-data";
import { aggregateSectors } from "@/lib/sector-aggregation";
import { applyThemes } from "@/lib/theme-lookup";
import { weekInfoFromKey } from "@/lib/week";
import { todayISO } from "@/lib/dates";

export type SectorPrediction = { name: string; reasoning: string };
// basePrice/firstSeenAt are injected server-side (not by the LLM) the first
// time a candidate appears under a given forWeekKey, and carried forward on
// every regeneration of that same week's prediction (see
// lib/weekly-prediction.ts) — they anchor the "예상 시점 대비 상승률" tracker
// to when the candidate was first predicted, not to whichever day the
// report happened to last regenerate.
export type CandidatePrediction = {
  name: string;
  code?: string;
  reasoning: string;
  basePrice?: number;
  firstSeenAt?: string; // ISO date
};

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
          basePrice: typeof r.basePrice === "number" ? (r.basePrice as number) : undefined,
          firstSeenAt: typeof r.firstSeenAt === "string" ? (r.firstSeenAt as string) : undefined,
        };
      });
    }
  } catch {
    // ignore
  }
  return [];
}

export type ScoredSector = SectorPrediction & { hit: boolean };
export type ScoredCandidate = CandidatePrediction & { hit: boolean; actualAvgChangePct: number | null };

export type ScoredPrediction = {
  forWeekKey: string;
  label: string;
  summary: string;
  sectors: ScoredSector[];
  candidates: ScoredCandidate[];
  sectorHitRate: number | null;
  candidateHitRate: number | null;
  actualHotSector: string | null;
};

type PredictionRow = { forWeekKey: string; summary: string; sectors: string; candidates: string };

// Only scoreable once the predicted week has actually finished, and only if
// it has real synced data — a week with no data yet (not synced, or a
// holiday-heavy week) just isn't judgeable, so this returns null rather
// than falsely scoring it 0%.
export async function scorePrediction(row: PredictionRow): Promise<ScoredPrediction | null> {
  const info = weekInfoFromKey(row.forWeekKey);
  if (info.endISO >= todayISO()) return null;

  const entries = await getEntriesInRange(info.startISO, info.endISO);
  if (entries.length === 0) return null;

  const themed = await applyThemes(
    entries.map((e) => ({ name: e.name, code: e.code, sector: e.sector, changePct: e.changePct }))
  );
  const agg = aggregateSectors(themed);
  const topSectors = agg.sectors.slice(0, 3).map((s) => s.name);

  const sectors: ScoredSector[] = parsePredictionSectors(row.sectors).map((s) => ({
    ...s,
    hit: topSectors.some((actual) => actual.includes(s.name) || s.name.includes(actual)),
  }));

  const candidates: ScoredCandidate[] = parsePredictionCandidates(row.candidates).map((c) => {
    const matches = entries.filter((e) => e.name === c.name);
    const avg = matches.length ? matches.reduce((sum, e) => sum + e.changePct, 0) / matches.length : null;
    return { ...c, hit: avg !== null && avg > 0, actualAvgChangePct: avg };
  });

  return {
    forWeekKey: row.forWeekKey,
    label: info.label,
    summary: row.summary,
    sectors,
    candidates,
    sectorHitRate: sectors.length ? sectors.filter((s) => s.hit).length / sectors.length : null,
    candidateHitRate: candidates.length ? candidates.filter((c) => c.hit).length / candidates.length : null,
    actualHotSector: agg.hotSector,
  };
}

export async function getScoredPredictionHistory(limit = 8): Promise<ScoredPrediction[]> {
  const rows = await prisma.weeklyPrediction.findMany({ orderBy: { createdAt: "desc" }, take: limit + 4 });
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
