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
export function currentMarketStatus(): MarketStatus {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const iso = `${get("year")}-${get("month")}-${get("day")}`;
  const minutesNow = Number(get("hour")) * 60 + Number(get("minute"));

  const tradingDay = !isMarketClosed(fromISO(iso));
  const withinHours = minutesNow >= MARKET_OPEN_MINUTES && minutesNow <= MARKET_CLOSE_MINUTES;
  const isOpen = tradingDay && withinHours;

  return { isOpen, label: isOpen ? "KRX 장중" : "장종료" };
}
