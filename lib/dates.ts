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
