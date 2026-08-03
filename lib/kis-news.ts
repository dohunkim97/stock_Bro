import { getKisAccessToken } from "@/lib/kis-token";

const NEWS_TITLE_URL = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/news-title";
const PER_REQUEST_TIMEOUT_MS = 8000;

export type KisNewsItem = {
  title: string;
  date: string; // YYYYMMDD
  time: string; // HHMMSS
  source?: string;
  stockName?: string;
};

// 종합 시황/공시(제목) — 국내주식-141, tr_id FHKST01011800.
//
// Called with FID_INPUT_ISCD blank ("전체"), this turns out to be a generic
// newswire firehose (정치/국제/사회 뉴스 — verified empirically), not curated
// market commentary, and nothing comes back tagged to a stock code. Scoped
// to a specific code, it returns genuinely relevant market-moving news for
// that stock instead (verified against 005930 — real 코스피 급락/사이드카
// coverage came back). So this only takes a code, not "all stocks" — callers
// should loop it over today's actual top movers, not call it blank.
async function fetchKisNewsTitleForCode(code: string, limit: number): Promise<KisNewsItem[]> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return [];

  const token = await getKisAccessToken();
  if (!token) return [];

  const url = new URL(NEWS_TITLE_URL);
  url.searchParams.set("FID_NEWS_OFER_ENTP_CODE", "");
  url.searchParams.set("FID_COND_MRKT_CLS_CODE", "");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_TITL_CNTT", "");
  url.searchParams.set("FID_INPUT_DATE_1", "");
  url.searchParams.set("FID_INPUT_HOUR_1", "");
  url.searchParams.set("FID_RANK_SORT_CLS_CODE", "");
  url.searchParams.set("FID_INPUT_SRNO", "");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST01011800",
        custtype: "P",
      },
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.rt_cd !== "0") return [];

    const output = json.output;
    const rows: Record<string, unknown>[] = Array.isArray(output) ? output : output ? [output] : [];

    return rows
      .map((o) => ({
        title: String(o.hts_pbnt_titl_cntt ?? "").trim(),
        date: String(o.data_dt ?? ""),
        time: String(o.data_tm ?? ""),
        source: String(o.dorg ?? "").trim() || undefined,
        stockName: String(o.kor_isnm1 ?? "").trim() || undefined,
      }))
      .filter((n) => n.title)
      .slice(0, limit);
  } catch {
    return [];
  }
}

const PER_STOCK_LIMIT = 3;
const CODE_CONCURRENCY = 4;

// Fetches news for each of the given (deduped) stock codes, a few at a
// time to stay under KIS's rate limit (same pattern as
// lib/kis-ranking.ts's enrichWithKisQuote), and flattens the results.
export async function fetchKisNewsForCodes(codes: string[]): Promise<KisNewsItem[]> {
  const unique = [...new Set(codes)].filter(Boolean);
  const results: KisNewsItem[] = [];

  for (let i = 0; i < unique.length; i += CODE_CONCURRENCY) {
    const batch = unique.slice(i, i + CODE_CONCURRENCY);
    const batchResults = await Promise.all(batch.map((code) => fetchKisNewsTitleForCode(code, PER_STOCK_LIMIT)));
    for (const r of batchResults) results.push(...r);
  }

  return results;
}
