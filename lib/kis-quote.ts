// Real-time(-ish) domestic stock quote via 한국투자증권 (KIS) OpenAPI —
// unlike data.go.kr's KRX price API (end-of-day only, often published a
// day or more late), this reflects the actual current trade price during
// market hours. One call also returns PER/PBR/EPS/BPS and a clean broad
// sector name (bstp_kor_isnm, e.g. "전기·전자") — a single request covers
// what used to take three separate data.go.kr calls.

import { getKisAccessToken } from "@/lib/kis-token";

const QUOTE_URL = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price";
const PER_REQUEST_TIMEOUT_MS = 6000;

export type KisQuote = {
  price: number;
  changePct: number;
  volume: number;
  tradingValue: number;
  marketCap: number; // raw KRW
  sharesOutstanding: number;
  per?: string;
  pbr?: string;
  eps?: string;
  bps?: string;
  sector?: string; // e.g. "전기·전자" — KRX's own broad industry grouping
};

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function cleanStat(v: unknown): string | undefined {
  const n = toNumber(v);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n.toFixed(2).replace(/\.00$/, "");
}

export async function fetchKisQuote(code: string): Promise<KisQuote | null> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return null;

  const token = await getKisAccessToken();
  if (!token) return null;

  const url = new URL(QUOTE_URL);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);

  // Calling this for ~100 stocks in concurrent batches (market-sync sector
  // enrichment) showed a meaningfully higher failure rate than the
  // occasional single-stock-page-view call — consistent with KIS rate
  // limiting under burst load. One retry after a short backoff recovers
  // most of those without much added latency for the common (single-call)
  // case.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: appKey,
          appsecret: appSecret,
          tr_id: "FHKST01010100",
          custtype: "P",
        },
        signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.rt_cd === "0") {
          const o = json.output ?? {};
          const price = toNumber(o.stck_prpr);
          const changePct = toNumber(o.prdy_ctrt);
          if (Number.isFinite(price) && Number.isFinite(changePct) && price > 0) {
            // hts_avls comes back in 억원 (hundred-million-won) units.
            const marketCap = toNumber(o.hts_avls) * 100_000_000;
            return {
              price,
              changePct,
              volume: toNumber(o.acml_vol) || 0,
              tradingValue: toNumber(o.acml_tr_pbmn) || 0,
              marketCap: Number.isFinite(marketCap) ? marketCap : 0,
              sharesOutstanding: toNumber(o.lstn_stcn) || 0,
              per: cleanStat(o.per),
              pbr: cleanStat(o.pbr),
              eps: cleanStat(o.eps),
              bps: cleanStat(o.bps),
              sector: String(o.bstp_kor_isnm ?? "").trim() || undefined,
            };
          }
        }
      }
    } catch {
      // fall through to retry
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}
