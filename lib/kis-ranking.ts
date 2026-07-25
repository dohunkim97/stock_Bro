// Real-time market-wide rankings via 한국투자증권 (KIS) — replaces the old
// approach of paging through data.go.kr's entire market snapshot (2500+
// rows) and sorting client-side. KIS's ranking endpoints return the top 30
// pre-sorted per market in one call each, and reflect the actual current
// state of the market rather than an end-of-day batch that can lag by a
// day or more.
//
// Only meaningful for "today" — these endpoints don't take a historical
// date parameter, they show the market as of right now. Backfilling a
// past date still goes through krx-sync.ts's data.go.kr path.

import { getKisAccessToken } from "@/lib/kis-token";
import { fetchKisQuote } from "@/lib/kis-quote";
import { isPreferredStock } from "@/lib/stock-filters";

const FLUCTUATION_URL = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/ranking/fluctuation";
const VOLUME_URL = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/volume-rank";
const PER_REQUEST_TIMEOUT_MS = 8000;
const BACKFILL_CONCURRENCY = 6;
const BACKFILL_BATCH_GAP_MS = 250;

export type KisRankRow = {
  name: string;
  code: string;
  market: string;
  price: number;
  changePct: number;
  volume: number;
  tradingValue: number;
  marketCap: number;
  sharesOutstanding: number;
  sector?: string;
};

async function kisRankingGet(
  url: string,
  params: Record<string, string>,
  trId: string,
  appKey: string,
  appSecret: string,
  token: string
): Promise<Record<string, unknown>[] | null> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  // KIS's ranking endpoints appear to have a tighter per-second rate limit
  // than the single-stock quote endpoint — seen a whole market silently
  // come back empty in production when four of these fired at once. One
  // retry after a short backoff recovers from that without much added cost.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(u.toString(), {
        headers: {
          authorization: `Bearer ${token}`,
          appkey: appKey,
          appsecret: appSecret,
          tr_id: trId,
          custtype: "P",
        },
        signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.rt_cd === "0") {
          return Array.isArray(json.output) ? (json.output as Record<string, unknown>[]) : [];
        }
      }
    } catch {
      // fall through to retry
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return null;
}

// 등락률순위 — gives price/체결/등락률/거래량 but not 거래대금 or 상장주식수,
// so market cap and PER/PBR inputs get backfilled separately below.
async function fetchFluctuationRanking(
  marketCode: "0001" | "1001",
  market: string,
  appKey: string,
  appSecret: string,
  token: string
): Promise<KisRankRow[]> {
  const rows = await kisRankingGet(
    FLUCTUATION_URL,
    {
      fid_cond_mrkt_div_code: "J",
      fid_cond_scr_div_code: "20170",
      fid_input_iscd: marketCode,
      fid_rank_sort_cls_code: "0",
      fid_input_cnt_1: "0",
      fid_prc_cls_code: "0",
      fid_input_price_1: "",
      fid_input_price_2: "",
      fid_vol_cnt: "",
      fid_trgt_cls_code: "0",
      fid_trgt_exls_cls_code: "0",
      fid_div_cls_code: "0",
      fid_rsfl_rate1: "",
      fid_rsfl_rate2: "",
    },
    "FHPST01700000",
    appKey,
    appSecret,
    token
  );
  if (!rows) return [];

  return rows
    .map((o) => ({
      name: String(o.hts_kor_isnm ?? "").trim(),
      code: String(o.stck_shrn_iscd ?? "").trim(),
      market,
      price: Number(o.stck_prpr) || 0,
      changePct: Number(o.prdy_ctrt) || 0,
      volume: Number(o.acml_vol) || 0,
      tradingValue: 0,
      marketCap: 0,
      sharesOutstanding: 0,
    }))
    .filter((r) => r.name && r.code.length === 6 && !isPreferredStock(r.name));
}

// 거래량순위 — includes 거래대금 and 상장주식수, so market cap can be
// computed directly (price × shares) without any extra lookups.
async function fetchVolumeRanking(
  marketCode: "0001" | "1001",
  market: string,
  appKey: string,
  appSecret: string,
  token: string
): Promise<KisRankRow[]> {
  const rows = await kisRankingGet(
    VOLUME_URL,
    {
      FID_COND_MRKT_DIV_CODE: "J",
      FID_COND_SCR_DIV_CODE: "20171",
      FID_INPUT_ISCD: marketCode,
      FID_DIV_CLS_CODE: "0",
      FID_BLNG_CLS_CODE: "0",
      FID_TRGT_CLS_CODE: "111111111",
      FID_TRGT_EXLS_CLS_CODE: "000000",
      FID_INPUT_PRICE_1: "",
      FID_INPUT_PRICE_2: "",
      FID_VOL_CNT: "",
      FID_INPUT_DATE_1: "",
    },
    "FHPST01710000",
    appKey,
    appSecret,
    token
  );
  if (!rows) return [];

  return rows
    .map((o) => {
      const shares = Number(o.lstn_stcn) || 0;
      const price = Number(o.stck_prpr) || 0;
      return {
        name: String(o.hts_kor_isnm ?? "").trim(),
        code: String(o.mksc_shrn_iscd ?? "").trim(),
        market,
        price,
        changePct: Number(o.prdy_ctrt) || 0,
        volume: Number(o.acml_vol) || 0,
        tradingValue: Number(o.acml_tr_pbmn) || 0,
        marketCap: price * shares,
        sharesOutstanding: shares,
      };
    })
    .filter((r) => r.name && r.code.length === 6 && !isPreferredStock(r.name));
}

// Neither ranking endpoint returns a sector/업종 field, and 등락률순위
// additionally lacks 거래대금/상장주식수 — a single-stock quote lookup per
// unique code fills in both. bstp_kor_isnm is KRX's own fixed ~20-category
// classification (전기·전자/화학/건설/제약 등) — broad, but always populated,
// unlike the data.go.kr financial-enrichment path which frequently comes
// back blank and falls through to "기타".
async function enrichWithKisQuote(rows: KisRankRow[]): Promise<void> {
  const byCode = new Map<string, KisRankRow[]>();
  for (const r of rows) {
    const list = byCode.get(r.code);
    if (list) list.push(r);
    else byCode.set(r.code, [r]);
  }

  const codes = [...byCode.keys()];
  for (let i = 0; i < codes.length; i += BACKFILL_CONCURRENCY) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, BACKFILL_BATCH_GAP_MS));
    const batch = codes.slice(i, i + BACKFILL_CONCURRENCY);
    await Promise.all(
      batch.map(async (code) => {
        const q = await fetchKisQuote(code);
        if (!q) return;
        for (const r of byCode.get(code) ?? []) {
          r.sector = q.sector;
          if (!r.sharesOutstanding) r.sharesOutstanding = q.sharesOutstanding;
          if (!r.marketCap) r.marketCap = q.marketCap;
          if (!r.tradingValue) r.tradingValue = q.tradingValue;
        }
      })
    );
  }
}

export async function fetchKisMarketRanking(): Promise<{ gainer: KisRankRow[]; volume: KisRankRow[] } | null> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return null;

  const token = await getKisAccessToken();
  if (!token) return null;

  // Run these one at a time rather than all four at once — production
  // showed an entire market (코스닥) silently dropping out when fired
  // concurrently, consistent with a per-second rate limit on these
  // particular endpoints.
  const kospiGainer = await fetchFluctuationRanking("0001", "코스피", appKey, appSecret, token);
  const kosdaqGainer = await fetchFluctuationRanking("1001", "코스닥", appKey, appSecret, token);
  const kospiVolume = await fetchVolumeRanking("0001", "코스피", appKey, appSecret, token);
  const kosdaqVolume = await fetchVolumeRanking("1001", "코스닥", appKey, appSecret, token);

  const gainer = [...kospiGainer, ...kosdaqGainer];
  const volume = [...kospiVolume, ...kosdaqVolume];
  if (gainer.length === 0 && volume.length === 0) return null;

  await enrichWithKisQuote([...gainer, ...volume]);

  return { gainer, volume };
}
