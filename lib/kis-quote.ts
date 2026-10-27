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
  // 기준가(stck_sdpr) — 보통 전일 종가지만 권리락·배당락·분할이 있으면 KIS가
  // 조정한 값이다. prdy_ctrt(changePct)도 이 기준가 대비라, 원 단위 변화를
  // 이걸로 계산해야 퍼센트와 서로 어긋나지 않는다. 응답에 없으면 null.
  prevClose: number | null;
  tradingHalted: boolean; // 임시정지(temp_stop_yn) 또는 종목상태 58(거래정지)
  statusLabel: string | null; // 관리종목/투자위험/투자경고/투자주의/단기과열 등 — 없으면 null
  fetchedAt: string; // ISO — 시세 기준 시각
  volume: number;
  tradingValue: number;
  marketCap: number; // raw KRW
  sharesOutstanding: number;
  per?: string;
  pbr?: string;
  eps?: string;
  bps?: string;
  sector?: string; // e.g. "전기·전자" — KRX's own broad industry grouping
  // 소속 시장 — rprs_mrkt_kor_name("KOSPI200"/"KOSDAQ"/"KSQ150" 등, 2026-10-27 실제
  // 응답으로 확인)에서 코스피/코스닥만 가려낸다. 둥지 알림이 "시장 전체 하락
  // 영향인지"를 볼 때 비교할 지수를 고르는 데 쓴다. 모르는 값이면 undefined.
  market?: "코스피" | "코스닥";
};

function marketOf(raw: unknown): "코스피" | "코스닥" | undefined {
  const s = String(raw ?? "").toUpperCase();
  if (/KOSDAQ|KSQ/.test(s)) return "코스닥";
  if (/KOSPI/.test(s)) return "코스피";
  return undefined;
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// iscd_stat_cls_code(종목 상태 구분) 중 투자자가 알아야 하는 것만. 00(정상)·
// 55(신용가능)·57(증거금100%) 같은 건 위험 신호가 아니라 뺐다.
const STATUS_LABELS: Record<string, string> = {
  "51": "관리종목",
  "52": "투자위험",
  "53": "투자경고",
  "54": "투자주의",
  "58": "거래정지",
  "59": "단기과열",
};

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
            const sdpr = toNumber(o.stck_sdpr);
            const statusCode = String(o.iscd_stat_cls_code ?? "").trim();
            return {
              price,
              changePct,
              prevClose: Number.isFinite(sdpr) && sdpr > 0 ? sdpr : null,
              tradingHalted: o.temp_stop_yn === "Y" || statusCode === "58",
              statusLabel: STATUS_LABELS[statusCode] ?? null,
              fetchedAt: new Date().toISOString(),
              volume: toNumber(o.acml_vol) || 0,
              tradingValue: toNumber(o.acml_tr_pbmn) || 0,
              marketCap: Number.isFinite(marketCap) ? marketCap : 0,
              sharesOutstanding: toNumber(o.lstn_stcn) || 0,
              per: cleanStat(o.per),
              pbr: cleanStat(o.pbr),
              eps: cleanStat(o.eps),
              bps: cleanStat(o.bps),
              sector: String(o.bstp_kor_isnm ?? "").trim() || undefined,
              market: marketOf(o.rprs_mrkt_kor_name),
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
