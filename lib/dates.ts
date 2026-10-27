import { isKrxHoliday } from "@/lib/krx-holidays";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// Explicitly Asia/Seoul — the server (Vercel) runs in UTC, so deriving
// "today" from the server's local Date would read as the previous day
// during Korean early-morning hours (e.g. 08:00 KST is still 23:00 UTC
// the day before).
export function todayISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

// A real timestamp (e.g. TelegramNews.createdAt)'s calendar date/time *in
// Asia/Seoul* — calling .getMonth()/.getDate()/.getHours() directly on a
// Date reads the SERVER's local timezone, which on Vercel is UTC. Since
// KST is UTC+9, anything timestamped between 00:00–09:00 KST then shows
// up as the previous day (and the wrong hour) — this is what made Golgoo
// cite a telegram article under "the wrong date" (lib/bro-context.ts,
// lib/market-briefing.ts both format TelegramNews.createdAt this way).
export function kstDateParts(d: Date): { month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

// "데이터 기준 시각" 표시용 — 골구가 "외국인 수급이 안 좋아"라고 말할 때
// 그 판단이 언제 계산됐는지(장중 수시로 바뀌는 값) 같이 보여주려고 만든다
// (module ③/④/⑤가 공유). 날짜는 이미 todayISO가 있으니 시:분만 더한다.
export function nowSeoulTimeLabel(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value;
  const m = parts.find((p) => p.type === "minute")?.value;
  return `${todayISO()} ${h}:${m}`;
}

export function toYYYYMMDD(iso: string): string {
  return iso.replace(/-/g, "");
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// 순수 달력일 오프셋 — prevBusinessDay/nextBusinessDay와 달리 주말·휴장일을
// 건너뛰지 않는다("어제"는 항상 어제지, 어제가 토요일이면 금요일로 당겨질
// 이유가 없다 — 소비는 주말에도 일어난다). lib/expense-parser.ts가 "어제
// 저녁 18000원" 같은 상대 날짜를 풀 때 쓴다.
export function offsetCalendarDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function formatDateLabel(iso: string): string {
  const d = fromISO(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day} (${WEEKDAYS[d.getDay()]})`;
}

export function weekdayLabel(iso: string): string {
  return WEEKDAYS[fromISO(iso).getDay()];
}

function isMarketClosed(d: Date): boolean {
  const w = d.getDay();
  if (w === 0 || w === 6) return true;
  return isKrxHoliday(toISO(d));
}

export function prevBusinessDay(iso: string): string {
  const d = fromISO(iso);
  do {
    d.setDate(d.getDate() - 1);
  } while (isMarketClosed(d));
  return toISO(d);
}

export function nextBusinessDay(iso: string): string {
  const d = fromISO(iso);
  do {
    d.setDate(d.getDate() + 1);
  } while (isMarketClosed(d));
  return toISO(d);
}

// fromIso와 toIso 사이(둘 다 제외)에 낀 평일(거래일) 수 — "주식 학습
// 플래닛"이 "지난 N일 건너뛰었네" 할 때 쓴다(lib/learning-push.ts). 둘이
// 같거나 fromIso가 더 미래면 0.
export function businessDaysBetweenExclusive(fromIso: string, toIso: string): number {
  let count = 0;
  let cursor = fromIso;
  while (true) {
    cursor = nextBusinessDay(cursor);
    if (cursor >= toIso) break;
    count++;
  }
  return count;
}

// The last `count` business days up to and including `endIso`, oldest
// first — e.g. for a rolling "최근 N거래일" table where the column set
// shouldn't be pinned to calendar-week boundaries the way "8월 3주" is.
export function recentBusinessDays(endIso: string, count: number): string[] {
  const days: string[] = [];
  let cursor = fromISO(endIso);
  if (isMarketClosed(cursor)) cursor = fromISO(prevBusinessDay(endIso));
  days.push(toISO(cursor));
  while (days.length < count) {
    cursor = fromISO(prevBusinessDay(toISO(cursor)));
    days.push(toISO(cursor));
  }
  return days.reverse();
}

// The date /market should default to when no ?date= is in the URL — today
// itself on a trading day, or the most recent completed trading day when
// today is a weekend/holiday (there's no synced data for a day that hasn't
// traded yet, so landing there would just show an empty page). The prev/next
// arrows in the date nav already skip weekends via prevBusinessDay/
// nextBusinessDay; this covers the one path that didn't — the initial
// landing date.
export function latestBusinessDay(): string {
  const today = todayISO();
  return isMarketClosed(fromISO(today)) ? prevBusinessDay(today) : today;
}

const MARKET_OPEN_MINUTES = 9 * 60; // 09:00
const MARKET_CLOSE_MINUTES = 15 * 60 + 30; // 15:30

export type MarketStatus = { isOpen: boolean; label: string };

// Real KRX trading-session check — weekday, not a holiday, and inside
// 09:00–15:30 KST. Safe to call from the browser (client components):
// it derives Asia/Seoul time explicitly rather than relying on the
// viewer's local timezone, which would misreport the session outside Korea.
function seoulDayAndMinutes(now: Date): { iso: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { iso: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function currentMarketStatus(): MarketStatus {
  const { iso, minutes } = seoulDayAndMinutes(new Date());
  const tradingDay = !isMarketClosed(fromISO(iso));
  const withinHours = minutes >= MARKET_OPEN_MINUTES && minutes <= MARKET_CLOSE_MINUTES;
  const isOpen = tradingDay && withinHours;

  return { isOpen, label: isOpen ? "KRX 장중" : "장종료" };
}

// 시세를 "현재가"로 부를지 "종가"로 부를지, 오늘 일봉 거래량이 아직 덜 찬
// 상태인지를 가르는 데 쓴다 — currentMarketStatus의 isOpen 하나로는 장전과
// 장 마감을 구분할 수 없다. now를 받는 건 테스트용.
export type MarketSession = "장전" | "장중" | "장 마감" | "휴장";

export function marketSession(now: Date = new Date()): MarketSession {
  const { iso, minutes } = seoulDayAndMinutes(now);
  if (isMarketClosed(fromISO(iso))) return "휴장";
  if (minutes < MARKET_OPEN_MINUTES) return "장전";
  if (minutes <= MARKET_CLOSE_MINUTES) return "장중";
  return "장 마감";
}
