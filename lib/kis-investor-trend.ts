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
  // 순매수 수량(주) — 거래대금은 백만원 단위로 반올림돼 와서 소형주는 "3백만원"처럼
  // 거칠게 보이므로, 정확한 값이 필요한 곳(둥지 알림 수급 상세)은 수량을 같이 쓴다.
  individualQty: number;
  foreignQty: number;
  institutionQty: number;
};

function toISO(yyyymmdd: string): string {
  return yyyymmdd.length === 8 ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` : yyyymmdd;
}

// opts.skipUnreported: 장중엔 오늘 행이 오긴 오는데 값이 전부 빈 문자열이다(장
// 마감 후 집계 — 2026-10-27 11:07 실제 응답으로 확인). 그대로 두면 Number("")=0이라
// "오늘 순매수 0원"처럼 읽혀서, 최근 5거래일 합계가 실제로는 4일치가 된다. 둥지
// 진단·알림은 이 옵션으로 아직 집계 안 된 행을 뺀다. 다른 화면(종목 상세 수급표
// 등)은 동작을 바꾸지 않으려고 기본값은 기존 그대로(false).
export async function fetchInvestorTrend(code: string, count = 10, opts: { skipUnreported?: boolean } = {}): Promise<InvestorTrendRow[]> {
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
      .filter((r) => !opts.skipUnreported || String(r.frgn_ntby_tr_pbmn ?? "").trim() !== "")
      .map((r) => ({
        date: toISO(String(r.stck_bsop_date ?? "")),
        individual: (Number(r.prsn_ntby_tr_pbmn) || 0) * TR_PBMN_UNIT,
        foreign: (Number(r.frgn_ntby_tr_pbmn) || 0) * TR_PBMN_UNIT,
        institution: (Number(r.orgn_ntby_tr_pbmn) || 0) * TR_PBMN_UNIT,
        individualQty: Number(r.prsn_ntby_qty) || 0,
        foreignQty: Number(r.frgn_ntby_qty) || 0,
        institutionQty: Number(r.orgn_ntby_qty) || 0,
      }))
      .filter((r) => r.date.length === 10)
      .slice(0, count);
  } catch {
    return [];
  }
}
