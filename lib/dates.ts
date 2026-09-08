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

// Asia/Seoul "now" as both its calendar date and minutes-since-midnight —
// shared by latestBusinessDay/currentMarketStatus so both agree on what
// time it actually is in Korea regardless of the server's own timezone.
function nowInSeoul(): { iso: string; minutes: number } {
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
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// sync-market (lib/sync-runner.ts) runs at 20:00 KST, right after the NXT
// 애프터마켓 close — until that cron actually runs, "today" has zero
// DailyEntry rows even on a normal trading day.
const DATA_READY_MINUTES = 20 * 60; // 20:00

// The date /market should default to when no ?date= is in the URL — today
// itself once today's sync has actually run, otherwise the most recent day
// that does have synced data (weekend/holiday, or simply too early in the
// day). Landing on a date with no rows yet would just show an empty page.
// The prev/next arrows in the date nav already skip weekends via
// prevBusinessDay/nextBusinessDay; this covers the one path that didn't —
// the initial landing date.
export function latestBusinessDay(): string {
  const { iso: today, minutes } = nowInSeoul();
  if (isMarketClosed(fromISO(today))) return prevBusinessDay(today);
  return minutes >= DATA_READY_MINUTES ? today : prevBusinessDay(today);
}

const MARKET_OPEN_MINUTES = 9 * 60; // 09:00
const MARKET_CLOSE_MINUTES = 15 * 60 + 30; // 15:30

export type MarketStatus = { isOpen: boolean; label: string };

// Real KRX trading-session check — weekday, not a holiday, and inside
// 09:00–15:30 KST. Safe to call from the browser (client components):
// it derives Asia/Seoul time explicitly rather than relying on the
// viewer's local timezone, which would misreport the session outside Korea.
export function currentMarketStatus(): MarketStatus {
  const { iso, minutes: minutesNow } = nowInSeoul();

  const tradingDay = !isMarketClosed(fromISO(iso));
  const withinHours = minutesNow >= MARKET_OPEN_MINUTES && minutesNow <= MARKET_CLOSE_MINUTES;
  const isOpen = tradingDay && withinHours;

  return { isOpen, label: isOpen ? "KRX 장중" : "장종료" };
}
