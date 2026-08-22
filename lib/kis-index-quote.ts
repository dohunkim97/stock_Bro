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

// ── 개장 여부 판정 ──────────────────────────────────────────────────────
// 요일+시간대(항상 필요)에 더해, 공휴일까지 정확히 걸러낸다:
//  - KRX(코스피/코스닥/코스피200/야간선물): KIS 국내휴장일조회 API로 실제 조회.
//  - 미국(나스닥/다우산업): NYSE 공휴일을 규칙대로 계산(공휴일이 요일 기반
//    규칙이라 알고리즘으로 항상 정확 — 부활절 기준 성금요일만 예외라 별도
//    계산식을 쓴다).
//  - 홍콩(홍콩H지수)만 예외로 남는다 — HKEX 휴장일 중 상당수가 음력 기준(춘절,
//    단오 등)이라 별도 음력 캘린더 데이터 없이는 계산할 수 없다. 시간대만으로
//    판정하므로 홍콩 공휴일엔 여전히 On으로 잘못 뜰 수 있다.
type MarketKind = "krxDay" | "krxNightFutures" | "us" | "hk";

function nowKst(): { y: number; m: number; d: number; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    weekday: dayMap[get("weekday")],
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function ymd(y: number, m: number, d: number): string {
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

function addDaysStr(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// KIS의 국내휴장일조회(CTCA0903R)는 "가급적 1일 1회 호출" 요청 사항이 있어,
// 실제 오늘 날짜 기준으로 하루에 한 번만 호출하도록 캐시한다. 한 번 조회하면
// 기준일부터 ~10일치를 같이 돌려주므로, 그 기준일을 야간선물/미국장의
// "전날" 케이스가 필요로 하는 가장 이른 날짜로 잡으면 오늘치까지 한 번에
// 다 들어온다.
let krxHolidayCache: { fetchedOnRealDay: string; days: Map<string, boolean> } = {
  fetchedOnRealDay: "",
  days: new Map(),
};

async function fetchKrxOpenDays(bassDt: string): Promise<Map<string, boolean>> {
  const json = await kisFetch(
    "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/chk-holiday",
    "CTCA0903R",
    { BASS_DT: bassDt, CTX_AREA_FK: "", CTX_AREA_NK: "" }
  );
  const rows: { bass_dt: string; opnd_yn: string }[] = Array.isArray(json?.output) ? json.output : [];
  return new Map(rows.map((r) => [r.bass_dt, r.opnd_yn === "Y"]));
}

// 개장일이면 true, 휴장일이면 false, 조회 실패면 null(→ 요일/시간대 판단만
// 신뢰하도록 기존 동작으로 대체).
async function isKrxOpenDay(y: number, m: number, d: number): Promise<boolean | null> {
  const dateStr = ymd(y, m, d);
  if (krxHolidayCache.days.has(dateStr)) return krxHolidayCache.days.get(dateStr)!;

  const real = nowKst();
  const realToday = ymd(real.y, real.m, real.d);
  if (krxHolidayCache.fetchedOnRealDay === realToday) return null; // 오늘 이미 시도했는데 이 날짜가 범위 밖이면 실패로 간주

  const days = await fetchKrxOpenDays(dateStr);
  if (days.size === 0) return null;
  krxHolidayCache = { fetchedOnRealDay: realToday, days: new Map([...krxHolidayCache.days, ...days]) };
  return krxHolidayCache.days.get(dateStr) ?? null;
}

function isUsMarketHoliday(y: number, m: number, d: number): boolean {
  return usMarketHolidays(y).has(ymd(y, m, d));
}

let usHolidayCacheYear: number | null = null;
let usHolidayCacheSet: Set<string> | null = null;

function usMarketHolidays(year: number): Set<string> {
  if (usHolidayCacheYear === year && usHolidayCacheSet) return usHolidayCacheSet;

  const nthWeekday = (month: number, weekday: number, n: number): [number, number, number] => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return [year, month, 1 + offset + (n - 1) * 7];
  };
  const lastWeekday = (month: number, weekday: number): [number, number, number] => {
    const last = new Date(Date.UTC(year, month, 0));
    const diff = (last.getUTCDay() - weekday + 7) % 7;
    return [year, month, last.getUTCDate() - diff];
  };
  // Meeus/Jones/Butcher 그레고리력 부활절 계산 — 성금요일 = 부활절 이틀 전.
  const easter = (): [number, number, number] => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d2 = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d2 - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const mo = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * mo + 114) / 31);
    const day = ((h + l - 7 * mo + 114) % 31) + 1;
    return [year, month, day];
  };
  const observed = ([y, m, d]: [number, number, number]): [number, number, number] => {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === 6) return [y, m, d - 1]; // 토요일 -> 금요일로 당김
    if (dow === 0) return [y, m, d + 1]; // 일요일 -> 월요일로 미룸
    return [y, m, d];
  };
  const minus = ([y, m, d]: [number, number, number], days: number): [number, number, number] => {
    const dt = new Date(Date.UTC(y, m - 1, d - days));
    return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  };

  const dates: [number, number, number][] = [
    observed([year, 1, 1]), // New Year's Day
    nthWeekday(1, 1, 3), // MLK Day - 1월 셋째 월요일
    nthWeekday(2, 1, 3), // Presidents Day - 2월 셋째 월요일
    minus(easter(), 2), // Good Friday
    lastWeekday(5, 1), // Memorial Day - 5월 마지막 월요일
    observed([year, 6, 19]), // Juneteenth
    observed([year, 7, 4]), // Independence Day
    nthWeekday(9, 1, 1), // Labor Day - 9월 첫째 월요일
    nthWeekday(11, 4, 4), // Thanksgiving - 11월 넷째 목요일
    observed([year, 12, 25]), // Christmas
  ];

  usHolidayCacheYear = year;
  usHolidayCacheSet = new Set(dates.map(([y, m, d]) => ymd(y, m, d)));
  return usHolidayCacheSet;
}

async function isMarketLive(kind: MarketKind): Promise<boolean> {
  const { y, m, d, weekday, minutes } = nowKst();
  const isWeekday = weekday >= 1 && weekday <= 5;
  const isWeekdayEvening = weekday >= 1 && weekday <= 5;
  const isWeekdayEarlyMorning = weekday >= 2 && weekday <= 6; // 월~금 저녁 세션이 이어지는 화~토 새벽

  switch (kind) {
    case "krxDay": {
      if (!isWeekday || !(minutes >= 9 * 60 && minutes <= 15 * 60 + 30)) return false;
      const open = await isKrxOpenDay(y, m, d);
      return open ?? true; // 조회 실패 시 요일/시간대 판단만 신뢰
    }
    case "krxNightFutures": {
      // 금 18:00 세션은 토 05:00까지 이어짐 — 이 세션이 "속한" 날짜는 항상
      // 시작한 저녁의 KRX 개장일 여부로 판단한다(다음날 새벽이면 전날 날짜로).
      const inWindow = (isWeekdayEvening && minutes >= 18 * 60) || (isWeekdayEarlyMorning && minutes < 5 * 60);
      if (!inWindow) return false;
      const belongsTo = isWeekdayEarlyMorning && minutes < 5 * 60 ? addDaysStr(y, m, d, -1) : { y, m, d };
      const open = await isKrxOpenDay(belongsTo.y, belongsTo.m, belongsTo.d);
      return open ?? true;
    }
    case "us": {
      // 3~11월은 대략 서머타임(EDT, UTC-4) 구간 — 정확한 전환일(3월 둘째
      // 일요일/11월 첫째 일요일)까지는 안 보고 월 단위로만 근사한다.
      const isDst = m >= 3 && m <= 11;
      const openMin = isDst ? 22 * 60 + 30 : 23 * 60 + 30;
      const closeMin = isDst ? 5 * 60 : 6 * 60;
      const inEvening = isWeekdayEvening && minutes >= openMin;
      const inEarlyMorning = isWeekdayEarlyMorning && minutes < closeMin;
      if (!inEvening && !inEarlyMorning) return false;
      const belongsTo = inEarlyMorning ? addDaysStr(y, m, d, -1) : { y, m, d };
      return !isUsMarketHoliday(belongsTo.y, belongsTo.m, belongsTo.d);
    }
    case "hk":
      // 공휴일 미반영 — 위 파일 헤더 설명 참고.
      return isWeekday && ((minutes >= 10 * 60 + 30 && minutes < 13 * 60) || (minutes >= 14 * 60 && minutes < 17 * 60));
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
  return Number.isFinite(price) && price > 0 ? { name, price, changePct, live: await isMarketLive("krxDay") } : null;
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

  const live = await isMarketLive(kind);
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
    ? { name: "코스피200 야간선물", price, changePct, live: await isMarketLive("krxNightFutures") }
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
