// 마켓 페이지의 작은 "주요 지수" 패널 — 코스피/코스닥/코스피200 (국내 실시간
// 지수), 코스피200 야간선물 (CME 연계 야간시장), 나스닥/다우산업/홍콩H지수
// (해외지수). 개별 종목 시세(kis-quote.ts)와는 다른 KIS 엔드포인트 3종을
// 쓴다 — 국내지수, 해외지수, 국내선물옵션. 세 endpoint 모두 실제 KIS 계정으로
// 직접 호출해 응답 형식을 확인한 뒤에 구현했다 (특히 해외지수는 종목코드가
// 문서화가 부실해서 후보 코드를 여러 개 대입해 실제로 값이 나오는 것만 채택
// — 나스닥은 티커 스타일 코드가 아니라 "COMP", 다우는 ".DJI"인데 이마저
// output1(실시간 스냅샷)은 항상 0이라 output2(일별 시세)의 최근 값을 써야
// 한다).
//
// 코스닥 야간선물은 의도적으로 뺐다 — CME 연계 야간파생 상품은 코스피200
// 선물·옵션뿐이라 실제로 존재하지 않는 상품이다(fo_cme_code.mst 마스터파일에
// KOSPI200 계약만 있고 코스닥 관련 계약이 없는 것으로 직접 확인함).

import zlib from "zlib";
import iconv from "iconv-lite";
import { getKisAccessToken } from "@/lib/kis-token";
import { todayISO, toYYYYMMDD } from "@/lib/dates";

const FETCH_TIMEOUT_MS = 8000;

export type IndexQuote = { name: string; price: number; changePct: number; live: boolean };

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Whether each market is currently in its trading session, purely from
// KST weekday+time-of-day windows — deliberately does NOT know about
// market holidays (KRX/US/HK closed days), since that needs its own
// calendar data source per market. On a holiday this will say "On" for a
// market that's actually closed; the price itself is still correct either
// way (KIS just returns the last real close), only the on/off badge can be
// briefly wrong. Computed from Asia/Seoul explicitly rather than the host's
// own timezone, since Vercel's serverless functions run in UTC.
type MarketKind = "krxDay" | "krxNightFutures" | "us" | "hk";

function nowKst(): { day: number; minutes: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[get("weekday")], minutes: Number(get("hour")) * 60 + Number(get("minute")), month: Number(get("month")) };
}

function isMarketLive(kind: MarketKind): boolean {
  const { day, minutes, month } = nowKst();
  const weekday = day >= 1 && day <= 5; // Mon-Fri
  const isWeekdayEvening = day >= 1 && day <= 5;
  const isWeekdayEarlyMorning = day >= 2 && day <= 6; // Tue-Sat = overnight tail of Mon-Fri evening starts

  switch (kind) {
    case "krxDay":
      return weekday && minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
    case "krxNightFutures":
      // 금 18:00 세션은 토 05:00까지 이어짐 — 시작 요일(월~금 저녁)과
      // 이어지는 다음날 새벽(화~토)을 둘 다 봐야 한다.
      return (isWeekdayEvening && minutes >= 18 * 60) || (isWeekdayEarlyMorning && minutes < 5 * 60);
    case "us": {
      // 3~11월은 대략 서머타임(EDT, UTC-4) 구간 — 정확한 전환일(3월 둘째
      // 일요일/11월 첫째 일요일)까지는 안 보고 월 단위로만 근사한다.
      const isDst = month >= 3 && month <= 11;
      const openMin = isDst ? 22 * 60 + 30 : 23 * 60 + 30;
      const closeMin = isDst ? 5 * 60 : 6 * 60;
      return (isWeekdayEvening && minutes >= openMin) || (isWeekdayEarlyMorning && minutes < closeMin);
    }
    case "hk":
      return weekday && ((minutes >= 10 * 60 + 30 && minutes < 13 * 60) || (minutes >= 14 * 60 && minutes < 17 * 60));
  }
}

async function kisFetch(url: string, trId: string, params: Record<string, string>) {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return null;

  const token = await getKisAccessToken();
  if (!token) return null;

  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  try {
    const res = await fetch(u.toString(), {
      headers: { authorization: `Bearer ${token}`, appkey: appKey, appsecret: appSecret, tr_id: trId, custtype: "P" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.rt_cd === "0" ? json : null;
  } catch {
    return null;
  }
}

// 국내지수(코스피/코스닥/코스피200) — 0001/1001/2001.
async function fetchDomesticIndex(name: string, code: string): Promise<IndexQuote | null> {
  const json = await kisFetch(
    "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-index-price",
    "FHPUP02100000",
    { FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: code }
  );
  const o = json?.output ?? {};
  const price = toNumber(o.bstp_nmix_prpr);
  const changePct = toNumber(o.bstp_nmix_prdy_ctrt);
  return Number.isFinite(price) && price > 0 ? { name, price, changePct, live: isMarketLive("krxDay") } : null;
}

// 해외지수 — 라이브 스냅샷(output1)이 비어있는 지수가 있어(다우 등), 일별
// 시세(output2)의 최근 값으로도 계산할 수 있게 두 경로 다 시도한다.
async function fetchOverseasIndex(name: string, code: string, kind: MarketKind): Promise<IndexQuote | null> {
  const end = toYYYYMMDD(todayISO());
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 14);
  const start = toYYYYMMDD(startDate.toISOString().slice(0, 10));

  const json = await kisFetch(
    "https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-daily-chartprice",
    "FHKST03030100",
    {
      FID_COND_MRKT_DIV_CODE: "N",
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: start,
      FID_INPUT_DATE_2: end,
      FID_PERIOD_DIV_CODE: "D",
    }
  );
  if (!json) return null;

  const live = isMarketLive(kind);
  const o1 = json.output1 ?? {};
  const livePrice = toNumber(o1.ovrs_nmix_prpr);
  if (Number.isFinite(livePrice) && livePrice > 0) {
    return { name, price: livePrice, changePct: toNumber(o1.prdy_ctrt), live };
  }

  const rows: { ovrs_nmix_prpr: string }[] = Array.isArray(json.output2) ? json.output2 : [];
  const latest = toNumber(rows[0]?.ovrs_nmix_prpr);
  const prev = toNumber(rows[1]?.ovrs_nmix_prpr);
  if (Number.isFinite(latest) && latest > 0 && Number.isFinite(prev) && prev > 0) {
    return { name, price: latest, changePct: ((latest - prev) / prev) * 100, live };
  }
  return null;
}

// CME 연계 야간선물 종목마스터(fo_cme_code.mst) — 만기가 지날 때마다 근월물
// 코드가 바뀌므로(예: A01609 → A01612) 하드코딩할 수 없다. 파일 자체가
// 13줄짜리라 매번 새로 받아도 무리 없지만, /market이 60초마다 자동
// 새로고침되는 걸 감안해 프로세스 내 캐시로 반복 다운로드는 피한다.
let cachedFrontMonthCode: { code: string; fetchedAt: number } | null = null;
const CODE_CACHE_MS = 6 * 60 * 60 * 1000;

function unzipSingleEntry(buf: Buffer): Buffer {
  const method = buf.readUInt16LE(8);
  const compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataStart = 30 + nameLen + extraLen;
  const compData = buf.subarray(dataStart, dataStart + compSize);
  return method === 8 ? zlib.inflateRawSync(compData) : Buffer.from(compData);
}

async function resolveKospi200NightFuturesCode(): Promise<string | null> {
  if (cachedFrontMonthCode && Date.now() - cachedFrontMonthCode.fetchedAt < CODE_CACHE_MS) {
    return cachedFrontMonthCode.code;
  }

  try {
    const res = await fetch("https://new.real.download.dws.co.kr/common/master/fo_cme_code.mst.zip", {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return cachedFrontMonthCode?.code ?? null;
    const zipBuf = Buffer.from(await res.arrayBuffer());
    const text = iconv.decode(unzipSingleEntry(zipBuf), "cp949");

    // type "1" = 단일 선물계약(스프레드 아님), 종목명에 KOSPI200 포함,
    // 만기월(YYYYMM 6자리)이 가장 이른 것이 근월물.
    const contracts = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("1") && line.includes("KOSPI200"))
      .map((line) => {
        const shortCode = line.slice(1, 10).trim();
        const expiryMatch = line.match(/\b(20\d{4})\b/);
        return { shortCode, expiry: expiryMatch ? Number(expiryMatch[1]) : Infinity };
      })
      .filter((c) => c.shortCode);

    contracts.sort((a, b) => a.expiry - b.expiry);
    const front = contracts[0]?.shortCode ?? null;
    if (front) cachedFrontMonthCode = { code: front, fetchedAt: Date.now() };
    return front ?? cachedFrontMonthCode?.code ?? null;
  } catch {
    return cachedFrontMonthCode?.code ?? null;
  }
}

async function fetchKospi200NightFutures(): Promise<IndexQuote | null> {
  const code = await resolveKospi200NightFuturesCode();
  if (!code) return null;

  const json = await kisFetch(
    "https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price",
    "FHMIF10000000",
    { FID_COND_MRKT_DIV_CODE: "F", FID_INPUT_ISCD: code }
  );
  const o = json?.output1 ?? {};
  const price = toNumber(o.futs_prpr);
  const changePct = toNumber(o.futs_prdy_ctrt);
  return Number.isFinite(price) && price > 0
    ? { name: "코스피200 야간선물", price, changePct, live: isMarketLive("krxNightFutures") }
    : null;
}

// best-effort per index — one feed being down (KIS rate limit, overseas
// data gap) shouldn't blank the whole panel, so failures are filtered out
// rather than propagated.
export async function getMarketIndexQuotes(): Promise<IndexQuote[]> {
  const results = await Promise.all([
    fetchDomesticIndex("코스피", "0001"),
    fetchDomesticIndex("코스닥", "1001"),
    fetchDomesticIndex("코스피200", "2001"),
    fetchKospi200NightFutures(),
    fetchOverseasIndex("나스닥", "COMP", "us"),
    fetchOverseasIndex("다우산업", ".DJI", "us"),
    fetchOverseasIndex("홍콩H지수", "HSCE", "hk"),
  ]);
  return results.filter((r): r is IndexQuote => r !== null);
}
