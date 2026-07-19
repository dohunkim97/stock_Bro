// Bridges 종목코드 (from GetStockSecuritiesInfoService) to 법인등록번호 (crno)
// via GetKrxListedInfoService, then pulls annual financials from
// GetFinaStatInfoService_V2 and industry classification from
// GetCorpBasicInfoService_V2 — none of these four data.go.kr services key
// on the same identifier, so this module is the glue between them.
//
// This is a best-effort enrichment layered on top of the core ranking sync.
// Production (Vercel) network latency to data.go.kr runs meaningfully
// slower than local — a full ~40-stock enrichment pass can blow past the
// route's time limit. Rather than let that take the whole sync down with
// it, fetchFinancialRatiosByCode stops starting new lookups once a time
// budget is exhausted; whatever stocks didn't get enriched just keep blank
// columns instead of failing the request.

import { formatWon } from "@/lib/format";

const LISTED_INFO_URL = "https://apis.data.go.kr/1160100/service/GetKrxListedInfoService/getItemInfo";
const FINA_STAT_URL =
  "https://apis.data.go.kr/1160100/service/GetFinaStatInfoService_V2/getSummFinaStat_V2";
const CORP_BASIC_URL =
  "https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2";

const PER_REQUEST_TIMEOUT_MS = 5000;
const CONCURRENCY = 12;

export type FinancialRatios = {
  per?: string;
  pbr?: string;
  roe?: string;
  debtRatio?: string;
  revenue?: string;
  industry?: string;
};

async function fetchJson(url: URL): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function itemsOf(json: Record<string, unknown> | null): Record<string, unknown>[] {
  const body = (json as { response?: { body?: unknown } } | null)?.response?.body as
    | { items?: { item?: unknown } }
    | undefined;
  const items = body?.items?.item;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : items ? [items as Record<string, unknown>] : [];
}

// srtnCd here comes back prefixed ("A005930"), unlike the plain 6-digit
// code from GetStockSecuritiesInfoService ("005930") — strip any leading
// non-digit characters before comparing. Foreign-incorporated names (HK/US
// shells etc.) report crno as all zeros, meaning "no domestic corp number".
function stripCodePrefix(raw: unknown): string {
  return String(raw ?? "").replace(/[^0-9]/g, "");
}

function isRealCrno(crno: string | undefined): crno is string {
  return !!crno && /[1-9]/.test(crno);
}

async function fetchCrno(code: string, serviceKey: string): Promise<string | null> {
  const url = new URL(LISTED_INFO_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("numOfRows", "5");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("likeSrtnCd", code);

  const json = await fetchJson(url);
  const list = itemsOf(json);
  const match = list.find((it) => stripCodePrefix(it.srtnCd) === code) ?? list[0];
  const crno = (match?.crno as string | undefined)?.trim();
  return isRealCrno(crno) ? crno : null;
}

type FinancialSummary = {
  netIncome: number;
  totalEquity: number;
  debtRatio: number;
  revenue: number;
};

async function fetchFinancialSummary(
  crno: string,
  serviceKey: string,
  years: number[]
): Promise<FinancialSummary | null> {
  for (const year of years) {
    const url = new URL(FINA_STAT_URL);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("resultType", "json");
    url.searchParams.set("numOfRows", "10");
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("crno", crno);
    url.searchParams.set("bizYear", String(year));

    const json = await fetchJson(url);
    const list = itemsOf(json);
    if (list.length === 0) continue;

    const consolidated = list.find((it) => it.fnclDcd === "110");
    const standalone = list.find((it) => it.fnclDcd === "120");
    const picked = consolidated ?? standalone ?? list[0];

    const netIncome = Number(picked.enpCrtmNpf);
    const totalEquity = Number(picked.enpTcptAmt);
    const debtRatio = Number(picked.fnclDebtRto);
    const revenue = Number(picked.enpSaleAmt);
    if (!Number.isFinite(netIncome) || !Number.isFinite(totalEquity)) continue;

    return { netIncome, totalEquity, debtRatio, revenue };
  }
  return null;
}

// GetCorpBasicInfoService_V2 returns one row per historical filing/change
// event for a company, and most of them leave sicNm (표준산업분류명) blank —
// only a handful of snapshots actually carry it. Scan a batch and take the
// first non-empty one rather than assuming the latest row has it.
async function fetchIndustryName(crno: string, serviceKey: string): Promise<string | null> {
  const url = new URL(CORP_BASIC_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("numOfRows", "20");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("crno", crno);

  const json = await fetchJson(url);
  const list = itemsOf(json);
  const withIndustry = list.find((it) => String(it.sicNm ?? "").trim());
  const sicNm = (withIndustry?.sicNm as string | undefined)?.trim();
  return sicNm || null;
}

function computeRatios(
  summary: FinancialSummary,
  price: number,
  sharesOutstanding: number
): FinancialRatios {
  const ratios: FinancialRatios = {};

  if (Number.isFinite(summary.debtRatio)) {
    ratios.debtRatio = `${summary.debtRatio.toFixed(1)}%`;
  }
  if (Number.isFinite(summary.revenue) && summary.revenue > 0) {
    ratios.revenue = formatWon(summary.revenue);
  }

  if (sharesOutstanding > 0) {
    const eps = summary.netIncome / sharesOutstanding;
    const bps = summary.totalEquity / sharesOutstanding;
    if (eps !== 0) ratios.per = (price / eps).toFixed(1);
    if (bps > 0) ratios.pbr = (price / bps).toFixed(1);
  }
  if (summary.totalEquity > 0) {
    ratios.roe = `${((summary.netIncome / summary.totalEquity) * 100).toFixed(1)}%`;
  }

  return ratios;
}

// Looks up financial ratios + industry classification for a batch of
// (code, price, sharesOutstanding) rows, deduping repeated codes and
// running a bounded number of requests in parallel. `budgetMs` caps total
// time spent here — once exceeded, remaining stocks are simply skipped
// (blank columns) rather than risking the whole route timing out.
export async function fetchFinancialRatiosByCode(
  rows: { code: string; price: number; sharesOutstanding: number }[],
  budgetMs = 30000
): Promise<Map<string, FinancialRatios>> {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  const result = new Map<string, FinancialRatios>();
  if (!serviceKey) return result;

  const deadline = Date.now() + budgetMs;

  const uniqueByCode = new Map<string, { price: number; sharesOutstanding: number }>();
  for (const r of rows) {
    if (!uniqueByCode.has(r.code)) {
      uniqueByCode.set(r.code, { price: r.price, sharesOutstanding: r.sharesOutstanding });
    }
  }

  const nowYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date())
  );
  const candidateYears = [nowYear - 1, nowYear - 2];

  const entries = [...uniqueByCode.entries()];
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    if (Date.now() >= deadline) break;

    const batch = entries.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ([code, { price, sharesOutstanding }]) => {
        try {
          const crno = await fetchCrno(code, serviceKey);
          if (!crno) return;

          const [summary, industry] = await Promise.all([
            fetchFinancialSummary(crno, serviceKey, candidateYears),
            fetchIndustryName(crno, serviceKey),
          ]);

          const ratios: FinancialRatios = summary ? computeRatios(summary, price, sharesOutstanding) : {};
          if (industry) ratios.industry = industry;
          if (Object.keys(ratios).length > 0) result.set(code, ratios);
        } catch {
          // best-effort enrichment — leave this stock's columns blank on any failure
        }
      })
    );
  }

  return result;
}
