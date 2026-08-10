import { getKisAccessToken } from "@/lib/kis-token";

const CHART_URL = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice";
const PER_REQUEST_TIMEOUT_MS = 8000;

export type ChartPeriod = "D" | "W" | "M";

export type ChartCandle = {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function toYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function toISO(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// 국내주식기간별시세(일/주/월/년) — 국내주식-016, tr_id FHKST03010100. Caps at
// 100 candles per call regardless of period, so the date window just needs
// to be wide enough to guarantee 100 are available (a year comfortably
// covers 100 daily/weekly/monthly candles).
export async function fetchKisChart(code: string, period: ChartPeriod = "D"): Promise<ChartCandle[]> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return [];

  const token = await getKisAccessToken();
  if (!token) return [];

  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);

  const url = new URL(CHART_URL);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_INPUT_DATE_1", toYYYYMMDD(start));
  url.searchParams.set("FID_INPUT_DATE_2", toYYYYMMDD(end));
  url.searchParams.set("FID_PERIOD_DIV_CODE", period);
  url.searchParams.set("FID_ORG_ADJ_PRC", "1"); // 원주가 — actual traded price, not split/dividend-adjusted

  try {
    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST03010100",
        custtype: "P",
      },
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.rt_cd !== "0") return [];

    const rows: Record<string, unknown>[] = Array.isArray(json.output2) ? json.output2 : [];

    // KIS returns newest-first; charts read left-to-right chronologically.
    return rows
      .map((r) => ({
        date: toISO(String(r.stck_bsop_date ?? "")),
        open: Number(r.stck_oprc) || 0,
        high: Number(r.stck_hgpr) || 0,
        low: Number(r.stck_lwpr) || 0,
        close: Number(r.stck_clpr) || 0,
        volume: Number(r.acml_vol) || 0,
      }))
      .filter((c) => c.date.length === 10 && c.close > 0)
      .reverse();
  } catch {
    return [];
  }
}
