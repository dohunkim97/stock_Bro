// 종목별 투자자매매동향(일별) — 국내주식-063, tr_id FHKST01010900. Field names
// verified against KIS's own official example repo (koreainvestment/
// open-trading-api). The _tr_pbmn (거래대금) fields come back in units of
// 백만원, not 원 — confirmed by cross-checking against a same-day news
// report of 삼성전자 외국인 순매수 (reported 1조 3,386억원 on 2026-08-14; this
// API's raw value of 1,336,152 × 1,000,000 = 1조 3,361.5억원, matching to
// within normal reporting/rounding variance) — so the ×1,000,000 below is
// load-bearing, not a guess.
const TR_PBMN_UNIT = 1_000_000;

import { getKisAccessToken } from "@/lib/kis-token";

const TREND_URL = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor";
const PER_REQUEST_TIMEOUT_MS = 8000;

export type InvestorTrendRow = {
  date: string; // YYYY-MM-DD
  individual: number; // 개인 순매수 거래대금 (원)
  foreign: number; // 외국인 순매수 거래대금 (원)
  institution: number; // 기관계 순매수 거래대금 (원)
};

function toISO(yyyymmdd: string): string {
  return yyyymmdd.length === 8 ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` : yyyymmdd;
}

export async function fetchInvestorTrend(code: string, count = 10): Promise<InvestorTrendRow[]> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return [];

  const token = await getKisAccessToken();
  if (!token) return [];

  const url = new URL(TREND_URL);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST01010900",
        custtype: "P",
      },
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.rt_cd !== "0") return [];

    const rows: Record<string, unknown>[] = Array.isArray(json.output) ? json.output : [];

    return rows
      .map((r) => ({
        date: toISO(String(r.stck_bsop_date ?? "")),
        individual: (Number(r.prsn_ntby_tr_pbmn) || 0) * TR_PBMN_UNIT,
        foreign: (Number(r.frgn_ntby_tr_pbmn) || 0) * TR_PBMN_UNIT,
        institution: (Number(r.orgn_ntby_tr_pbmn) || 0) * TR_PBMN_UNIT,
      }))
      .filter((r) => r.date.length === 10)
      .slice(0, count);
  } catch {
    return [];
  }
}
