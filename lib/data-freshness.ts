// 마켓 페이지 각 구역(TOP종목/업종상위/테마별 자금흐름 등)이 보여주는
// 가격·등락률이 "언제 기준"인지 알려주는 라벨 — 사용자 요청: "어제 장마감
// 기준 가격이면 어제 3시반 장마감 기준 이렇게" 표시. 이 구역들은 전부
// sync-market 크론(하루 3번, 09:00/12:00/15:30 KST)이 써넣은 DailyEntry/
// ThemeDailyFlow/ThemeNetFlow 스냅샷이라, "그 데이터가 대표하는 거래일" +
// "실제로 동기화된 시각"을 합쳐서 보여준다 — 지금 이 순간이 아니라 마지막
// 동기화 시점 기준이라는 걸 명확히 하기 위함.
import { formatDateLabel } from "@/lib/dates";

type SyncSlot = "open" | "midday" | "close";

const SLOT_LABEL: Record<SyncSlot, string> = {
  open: "장시작",
  midday: "정오",
  close: "장마감",
};

// 정확히 9/12/15:30일 필요는 없다(동기화 자체가 몇 분 걸림) — 09:00~11:59
// 완료면 장시작 회차, 12:00~15:29면 정오 회차, 그 외(15:30~다음날 08:59,
// 재시도로 늦게 끝난 경우 포함)는 장마감 회차로 분류.
function slotFor(hour: number, minute: number): SyncSlot {
  const m = hour * 60 + minute;
  if (m >= 9 * 60 && m < 12 * 60) return "open";
  if (m >= 12 * 60 && m < 15 * 60 + 30) return "midday";
  return "close";
}

// entryDate: 그 데이터가 대표하는 거래일("YYYY-MM-DD", DailyEntry.date 등).
// syncedAt: 실제로 동기화(크론)가 이 데이터를 써넣은 시각.
export function describeSyncBasis(entryDate: string, syncedAt: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(syncedAt);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${formatDateLabel(entryDate)} ${hh}:${mm} ${SLOT_LABEL[slotFor(hour, minute)]} 기준`;
}

// rows: date/createdAt를 가진 아무 배열(DailyEntry[]/ThemeDailyFlow[]/
// ThemeNetFlow[] 등) — 그중 가장 최근 createdAt을 골라 그 행의 date와 함께
// 라벨을 만든다. 빈 배열이면 null(그 구역에 보여줄 데이터 자체가 없다는
// 뜻이라 라벨도 생략).
export function basisLabelFromRows(rows: { date: string; createdAt: Date }[]): string | null {
  if (rows.length === 0) return null;
  const latest = rows.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return describeSyncBasis(latest.date, latest.createdAt);
}
