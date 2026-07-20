// Live single-stock refresh for the stock detail page — unlike krx-sync.ts
// (which snapshots a fixed top-N ranking once a day), this looks up
// whatever code the user is currently viewing, fetches its latest price +
// financials on demand, and upserts the result into StockMaster so it
// keeps itself current the more it actually gets viewed.

import { prisma } from "@/lib/prisma";
import { formatWon } from "@/lib/format";
import { todayISO, toYYYYMMDD, prevBusinessDay } from "@/lib/dates";
import { fetchFinancialRatiosByCode } from "@/lib/krx-financials";

const API_BASE =
  "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo";
const PER_REQUEST_TIMEOUT_MS = 6000;
const OVERALL_TIMEOUT_MS = 12000;
const MAX_DAY_TRIES = 6;
const FRESH_ENOUGH_MS = 10 * 60 * 1000; // 10 minutes

function normalizeMarket(raw: unknown): string {
  const v = String(raw ?? "").toUpperCase();
  if (v.includes("KOSDAQ")) return "코스닥";
  if (v.includes("KOSPI")) return "코스피";
  return String(raw ?? "");
}

type RawQuote = {
  name: string;
  code: string;
  market: string;
  price: number;
  changePct: number;
  marketCap: number;
  sharesOutstanding: number;
  date: string;
};

async function fetchQuoteForDate(code: string, isoDate: string, serviceKey: string): Promise<RawQuote | null> {
  const url = new URL(API_BASE);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("basDt", toYYYYMMDD(isoDate));
  url.searchParams.set("numOfRows", "5");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("likeSrtnCd", code);

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = await res.json();
    const items = json?.response?.body?.items?.item;
    const list: Record<string, unknown>[] = Array.isArray(items) ? items : items ? [items] : [];
    const match = list.find((it) => String(it.srtnCd ?? "").replace(/[^0-9]/g, "").slice(-6) === code);
    if (!match) return null;

    const price = Number(match.clpr);
    const changePct = Number(match.fltRt);
    if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null;

    return {
      name: String(match.itmsNm ?? "").trim(),
      code,
      market: normalizeMarket(match.mrktCtg),
      price,
      changePct,
      marketCap: Number(match.mrktTotAmt) || 0,
      sharesOutstanding: Number(match.lstgStCnt) || 0,
      date: isoDate,
    };
  } catch {
    return null;
  }
}

async function findLatestQuote(code: string, serviceKey: string): Promise<RawQuote | null> {
  let candidate = todayISO();
  for (let i = 0; i < MAX_DAY_TRIES; i++) {
    const quote = await fetchQuoteForDate(code, candidate, serviceKey);
    if (quote) return quote;
    candidate = prevBusinessDay(candidate);
  }
  return null;
}

export type PricePoint = { date: string; close: number };

// One ranged query per stock (beginBasDt/endBasDt), not one call per day —
// the price API supports date-range filtering for a single code, so a
// ~100-day chart costs exactly one request.
export async function fetchPriceHistory(code: string, days = 100): Promise<PricePoint[]> {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) return [];

  const end = todayISO();
  const [y, m, d] = end.split("-").map(Number);
  const beginDate = new Date(y, m - 1, d);
  beginDate.setDate(beginDate.getDate() - days);
  const begin = `${beginDate.getFullYear()}-${String(beginDate.getMonth() + 1).padStart(2, "0")}-${String(beginDate.getDate()).padStart(2, "0")}`;

  const url = new URL(API_BASE);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("numOfRows", "200");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("likeSrtnCd", code);
  url.searchParams.set("beginBasDt", toYYYYMMDD(begin));
  url.searchParams.set("endBasDt", toYYYYMMDD(end));

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS) });
    if (!res.ok) return [];
    const json = await res.json();
    const items = json?.response?.body?.items?.item;
    const list: Record<string, unknown>[] = Array.isArray(items) ? items : items ? [items] : [];

    const points = list
      .filter((it) => String(it.srtnCd ?? "").replace(/[^0-9]/g, "").slice(-6) === code)
      .map((it) => {
        const basDt = String(it.basDt ?? "");
        const iso = basDt.length === 8 ? `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}` : "";
        const close = Number(it.clpr);
        return { date: iso, close };
      })
      .filter((p): p is PricePoint => !!p.date && Number.isFinite(p.close));

    return points.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export type StockSnapshot = {
  code: string;
  name: string;
  market: string;
  sector?: string;
  price: string;
  changePct: number;
  marketCap?: string;
  per?: string;
  pbr?: string;
  roe?: string;
  debtRatio?: string;
  revenue?: string;
  industry?: string;
  quoteDate: string;
};

async function refreshStockSnapshotInner(code: string): Promise<StockSnapshot | null> {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) return null;

  // Skip the network round trips entirely if we refreshed this stock
  // recently — every page view would otherwise re-run the full lookup,
  // which is slow and pointless when nothing has changed in the last
  // few minutes.
  const existing = await prisma.stockMaster.findUnique({
    where: { code },
    select: { updatedAt: true },
  });
  if (existing && Date.now() - existing.updatedAt.getTime() < FRESH_ENOUGH_MS) {
    return null;
  }

  const quote = await findLatestQuote(code, serviceKey);
  if (!quote) return null;

  const ratiosMap = await fetchFinancialRatiosByCode(
    [{ code: quote.code, price: quote.price, sharesOutstanding: quote.sharesOutstanding }],
    OVERALL_TIMEOUT_MS
  );
  const fin = ratiosMap.get(quote.code);

  const snapshot: StockSnapshot = {
    code: quote.code,
    name: quote.name,
    market: quote.market,
    sector: fin?.industry,
    price: quote.price.toLocaleString(),
    changePct: quote.changePct,
    marketCap: formatWon(quote.marketCap),
    per: fin?.per,
    pbr: fin?.pbr,
    roe: fin?.roe,
    debtRatio: fin?.debtRatio,
    revenue: fin?.revenue,
    industry: fin?.industry,
    quoteDate: quote.date,
  };

  await prisma.stockMaster.upsert({
    where: { code: snapshot.code },
    create: {
      code: snapshot.code,
      name: snapshot.name,
      market: snapshot.market,
      sector: snapshot.sector ?? "기타",
      price: snapshot.price,
      changePct: snapshot.changePct,
      marketCap: snapshot.marketCap,
      per: snapshot.per,
      pbr: snapshot.pbr,
      roe: snapshot.roe,
      debtRatio: snapshot.debtRatio,
      revenue: snapshot.revenue,
      industry: snapshot.industry,
      quoteDate: snapshot.quoteDate,
    },
    // undefined fields are left untouched by Prisma — a partial refresh
    // (e.g. financial lookup failed but price succeeded) never blanks out
    // previously-known-good data, only fills gaps forward.
    update: {
      name: snapshot.name,
      market: snapshot.market,
      sector: snapshot.sector,
      price: snapshot.price,
      changePct: snapshot.changePct,
      marketCap: snapshot.marketCap,
      per: snapshot.per,
      pbr: snapshot.pbr,
      roe: snapshot.roe,
      debtRatio: snapshot.debtRatio,
      revenue: snapshot.revenue,
      industry: snapshot.industry,
      quoteDate: snapshot.quoteDate,
    },
  });

  return snapshot;
}

// Best-effort — the stock detail page falls back to whatever cached data
// it already has (StockMaster / latest DailyEntry) if this fails or the
// hard timeout below trips, so a slow or flaky data.go.kr response never
// breaks the page.
export async function refreshStockSnapshot(code: string): Promise<StockSnapshot | null> {
  try {
    return await Promise.race([
      refreshStockSnapshotInner(code),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), OVERALL_TIMEOUT_MS + 3000)),
    ]);
  } catch {
    return null;
  }
}
