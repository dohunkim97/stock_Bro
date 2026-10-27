// 보유종목 알림 C단계의 데이터 조회 쪽 — 뉴스(네이버)·공시(DART)·업종(테마별 등락,
// DB)·시장 지수(KIS)·투자 논리(HoldingThesis)를 모은다. 판단·분류는 전부 순수
// 모듈(lib/holding-context.ts)이 하고, 여기는 가져오기만 한다.
//
// 무거운 조회라 등급이 실제로 나빠져 알림을 보낼 종목에만 부른다(lib/portfolio-
// alerts.ts). 크론(intraday-monitor)이 60초 한도라 deadlineAt을 넘기면 그 항목은
// 실패로 기록하고 넘어간다 — 실패를 "없음"으로 바꾸지 않는다.

import { prisma } from "@/lib/prisma";
import { fetchNewsResult, type NewsItem } from "@/lib/naver-news";
import { fetchLatestQuarterlyFinancials, fetchRecentFilingsResult, getCorpCode } from "@/lib/dart";
import { getMarketIndexQuotes } from "@/lib/kis-index-quote";
import { getThesis } from "@/lib/holding-thesis";
import { prevBusinessDay } from "@/lib/dates";
import {
  decomposeMove,
  importantFilings,
  recentRelevantNews,
  sectorAverage,
  type ClassifiedFiling,
  type MoveDecomposition,
  type QuarterlyFinancials,
} from "@/lib/holding-context";

export type MarketIndexMap = { 코스피: number | null; 코스닥: number | null; ok: boolean };

// 알림 한 번에 한 번만 부른다(종목마다 부르지 않게).
export async function fetchMarketIndexMap(): Promise<MarketIndexMap> {
  try {
    const quotes = await getMarketIndexQuotes();
    const pick = (name: string) => quotes.find((q) => q.name === name && q.live)?.changePct ?? null;
    const map = { 코스피: pick("코스피"), 코스닥: pick("코스닥") };
    return { ...map, ok: map.코스피 !== null || map.코스닥 !== null };
  } catch {
    return { 코스피: null, 코스닥: null, ok: false };
  }
}

export type HoldingContext = {
  news: { ok: boolean; items: NewsItem[] };
  filings: { ok: boolean; items: ClassifiedFiling[]; total: number };
  quarterly: { ok: boolean; data: QuarterlyFinancials | null };
  theme: string | null;
  move: MoveDecomposition;
  thesis: { reason: string; invalidation: string | null; updatedAt: string } | null;
};

async function sectorFor(code: string): Promise<{ theme: string | null; sector: Parameters<typeof decomposeMove>[0]["sector"] }> {
  const st = await prisma.stockTheme.findFirst({ where: { code }, select: { theme: true } });
  if (!st) return { theme: null, sector: null };
  const latest = await prisma.themeDailyFlow.findFirst({ where: { theme: st.theme }, orderBy: { date: "desc" }, select: { date: true } });
  if (!latest) return { theme: st.theme, sector: null };
  const rows = await prisma.themeDailyFlow.findMany({
    where: { theme: st.theme, date: latest.date },
    select: { code: true, changePct: true, createdAt: true },
  });
  const avg = sectorAverage(rows, code);
  if (!avg) return { theme: st.theme, sector: null };
  const syncedAt = rows.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), rows[0].createdAt);
  const self = rows.find((r) => r.code === code);
  return {
    theme: st.theme,
    sector: { name: st.theme, avgPct: avg.avgPct, peers: avg.peers, asOf: syncedAt.toISOString(), selfPct: self?.changePct ?? null },
  };
}

export async function gatherHoldingContext(p: {
  userId: string;
  code: string;
  name: string;
  stockPct: number | null;
  market: "코스피" | "코스닥" | undefined;
  indices: MarketIndexMap;
  deadlineAt: number;
}): Promise<HoldingContext> {
  const now = Date.now();
  const corpPromise = getCorpCode(p.code, p.deadlineAt).catch(() => null);
  const [newsRes, filingsRes, quarterly, sector, thesis] = await Promise.all([
    fetchNewsResult(p.name, 20, "date").catch(() => ({ ok: false, items: [] as NewsItem[] })),
    (async () => {
      const corp = await corpPromise;
      if (!corp) return { ok: false, filings: [] };
      return fetchRecentFilingsResult(corp, p.deadlineAt, 30);
    })().catch(() => ({ ok: false, filings: [] })),
    (async () => {
      const corp = await corpPromise;
      if (!corp) return { ok: false, data: null };
      return fetchLatestQuarterlyFinancials(corp, p.deadlineAt);
    })().catch(() => ({ ok: false, data: null })),
    sectorFor(p.code).catch(() => ({ theme: null, sector: null })),
    getThesis(p.userId, p.code).catch(() => null),
  ]);

  const marketPct = p.market ? p.indices[p.market] : null;
  return {
    news: { ok: newsRes.ok, items: recentRelevantNews(p.name, newsRes.items, now) },
    filings: { ok: filingsRes.ok, items: importantFilings(filingsRes.filings), total: filingsRes.filings.length },
    quarterly,
    theme: sector.theme,
    move: decomposeMove({
      stockPct: p.stockPct,
      market: p.market && marketPct !== null ? { name: p.market, pct: marketPct } : null,
      sector: sector.sector,
    }),
    thesis: thesis ? { reason: thesis.reason, invalidation: thesis.invalidation, updatedAt: thesis.updatedAt.toISOString() } : null,
  };
}

// 사건 감지용(lib/holding-events.ts) — 보유 전 종목의 오늘·전 거래일 중요 공시를 정시마다
// 본다. 등급과 무관하게 공시는 바로 알려야 해서 알림 대상 종목만이 아니라 전부. 조회에
// 실패한 종목은 null(그 종목은 "공시 없음"으로 처리하지 않는다).
export async function fetchRecentImportantFilings(codes: string[], date: string, deadlineAt: number): Promise<Map<string, ClassifiedFiling[] | null>> {
  const since = prevBusinessDay(date).replaceAll("-", "");
  const out = new Map<string, ClassifiedFiling[] | null>();
  await Promise.all(
    codes.map(async (code) => {
      try {
        const corp = await getCorpCode(code, deadlineAt);
        if (!corp) return void out.set(code, null);
        const res = await fetchRecentFilingsResult(corp, deadlineAt, 5);
        out.set(code, res.ok ? importantFilings(res.filings.filter((f) => f.reportDate >= since), 20) : null);
      } catch {
        out.set(code, null);
      }
    })
  );
  return out;
}
