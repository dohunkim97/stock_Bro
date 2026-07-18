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

// ISO date `daysBack` calendar days before today (Asia/Seoul), inclusive of
// today when daysBack is 0. Used to build "last N days" query cutoffs —
// plain string comparison works because ISO dates sort chronologically.
export function daysAgoISO(daysBack: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - daysBack);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
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
