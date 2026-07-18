import { todayISO } from "@/lib/dates";

// Month-anchored "N월 M주" buckets — not ISO/rolling weeks. Week M covers
// days [(M-1)*7+1, M*7] of the month, except week 4 which absorbs every
// remaining day (22 through month-end) so a month is always exactly 4
// weeks, matching how people informally say "이번 달 4주차" in Korean.
export type WeekInfo = {
  key: string; // "2026-07-2"
  year: number;
  month: number; // 1-12
  week: number; // 1-4
  startISO: string;
  endISO: string;
  label: string; // "7월 2주"
};

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function weekInfoFromDate(iso: string): WeekInfo {
  const [y, m, d] = iso.split("-").map(Number);
  const week = Math.min(4, Math.ceil(d / 7));
  const startDay = (week - 1) * 7 + 1;
  const endDay = week === 4 ? daysInMonth(y, m) : week * 7;
  return {
    key: `${y}-${pad(m)}-${week}`,
    year: y,
    month: m,
    week,
    startISO: `${y}-${pad(m)}-${pad(startDay)}`,
    endISO: `${y}-${pad(m)}-${pad(endDay)}`,
    label: `${m}월 ${week}주`,
  };
}

export function weekInfoFromKey(key: string): WeekInfo {
  const [y, m, w] = key.split("-").map(Number);
  const startDay = (w - 1) * 7 + 1;
  return weekInfoFromDate(`${y}-${pad(m)}-${pad(startDay)}`);
}

export function currentWeekKey(): string {
  return weekInfoFromDate(todayISO()).key;
}

export function prevWeekKey(key: string): string {
  const info = weekInfoFromKey(key);
  if (info.week > 1) return `${info.year}-${pad(info.month)}-${info.week - 1}`;
  const prevMonth = info.month === 1 ? 12 : info.month - 1;
  const prevYear = info.month === 1 ? info.year - 1 : info.year;
  return `${prevYear}-${pad(prevMonth)}-4`;
}

export function nextWeekKey(key: string): string {
  const info = weekInfoFromKey(key);
  if (info.week < 4) return `${info.year}-${pad(info.month)}-${info.week + 1}`;
  const nextMonth = info.month === 12 ? 1 : info.month + 1;
  const nextYear = info.month === 12 ? info.year + 1 : info.year;
  return `${nextYear}-${pad(nextMonth)}-1`;
}
