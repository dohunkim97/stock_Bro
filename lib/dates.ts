const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function todayISO(): string {
  const now = new Date();
  return toISO(now);
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

function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

export function prevBusinessDay(iso: string): string {
  const d = fromISO(iso);
  do {
    d.setDate(d.getDate() - 1);
  } while (isWeekend(d));
  return toISO(d);
}

export function nextBusinessDay(iso: string): string {
  const d = fromISO(iso);
  do {
    d.setDate(d.getDate() + 1);
  } while (isWeekend(d));
  return toISO(d);
}
