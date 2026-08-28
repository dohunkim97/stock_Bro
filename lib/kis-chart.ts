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

async function fetchPage(
  code: string,
  period: ChartPeriod,
  start: Date,
  end: Date,
  appKey: string,
  appSecret: string,
  token: string
): Promise<ChartCandle[]> {
  const url = new URL(CHART_URL);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_INPUT_DATE_1", toYYYYMMDD(start));
  url.searchParams.set("FID_INPUT_DATE_2", toYYYYMMDD(end));
  url.searchParams.set("FID_PERIOD_DIV_CODE", period);
  // 수정주가(액면분할·무상증자 등 반영) — 원주가("1")로 두면 과거 분할 이력이 있는
  // 종목(예: 삼성전자 2018년 50:1 분할)에서 그 시점에 가격이 수직으로 뚝 떨어지는
  // 것처럼 보여서, 장기 월봉·주봉 차트가 실제로는 정상인데 깨진 것처럼 보임.
  url.searchParams.set("FID_ORG_ADJ_PRC", "0");

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

// How wide a single call's date window needs to be to comfortably contain
// 100+ candles of that period (KIS caps each call at 100 rows regardless of
// how wide the window is — see the paging loop below).
const WINDOW_YEARS: Record<ChartPeriod, number> = { D: 1, W: 3, M: 10 };

// Enough history for a 200일선 to actually read as a trend line across a
// good portion of the chart, not just a single dot on the most recent bar.
// This stays the default for most callers (chart display, short-window
// signals) — passing a larger `targetCandles` (see lib/technical-signals.ts's
// LONG_TERM_SIGNAL_CANDLES) only widens the fetch for the specific callers
// that actually need deep history (300일선/480일선 등), instead of slowing
// down every fetchKisChart call in the app.
const TARGET_CANDLES = 300;
const DEFAULT_MAX_EXTRA_PAGES = 2;

// 국내주식기간별시세(일/주/월/년) — 국내주식-016, tr_id FHKST03010100. One call
// caps at 100 candles regardless of period or date-range width, so getting
// enough history for a long moving average means paging backwards: each
// extra call's window ends the day before the earliest candle seen so far
// and reaches back another WINDOW_YEARS.
export async function fetchKisChart(
  code: string,
  period: ChartPeriod = "D",
  targetCandles: number = TARGET_CANDLES
): Promise<ChartCandle[]> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return [];

  const token = await getKisAccessToken();
  if (!token) return [];

  const windowYears = WINDOW_YEARS[period];
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - windowYears);

  let all = await fetchPage(code, period, start, end, appKey, appSecret, token);

  // KIS returns ~100 rows/call, so reaching `targetCandles` needs roughly
  // that many extra pages — never fewer than the historical default so
  // existing behavior at the default target doesn't change.
  const maxExtraPages = Math.max(DEFAULT_MAX_EXTRA_PAGES, Math.ceil(targetCandles / 100) - 1);

  for (let i = 0; i < maxExtraPages && all.length > 0 && all.length < targetCandles; i++) {
    const nextEnd = new Date(all[0].date);
    nextEnd.setDate(nextEnd.getDate() - 1);
    const nextStart = new Date(nextEnd);
    nextStart.setFullYear(nextStart.getFullYear() - windowYears);

    const page = await fetchPage(code, period, nextStart, nextEnd, appKey, appSecret, token);
    if (page.length === 0) break; // hit the start of the stock's trading history
    all = [...page, ...all];
  }

  return all;
}
