// "주식 학습 플래닛" 진행 상태(LearningProgress)와 일지(LearningJournalEntry)
// CRUD — lib/learning-push.ts(자료 제공)와 lib/golgoo-chat.ts(일지 기록
// 도구, 시작/완료/일시정지 명령)가 공유한다.
//
// currentDay는 "지금 진행 중인(아직 완료 안 한) 일차"다. 2026-10-19 전엔
// 자료를 요청하기만 해도 이게 올라갔는데(사용자 기획서 규칙 "학습 완료
// 버튼을 눌렀을 때만 완료 처리한다"와 어긋남), 지금은 두 날짜 필드로
// 나뉜다 — lastPushDate(그날 자료를 보여준 날, 중복 안내 방지용)와
// lastCompletedDate("학습 완료"라고 말해서 실제로 끝낸 날, 이것만 currentDay
// 를 올린다).

import { prisma } from "@/lib/prisma";
import { todayISO, prevBusinessDay } from "@/lib/dates";
import { TOTAL_DAYS } from "@/lib/learning-curriculum";

export type LearningProgressData = {
  userId: string;
  startDate: string;
  currentDay: number;
  lastPushDate: string | null;
  lastCompletedDate: string | null;
  streak: number;
  paused: boolean;
};

export async function getProgress(userId: string): Promise<LearningProgressData | null> {
  return prisma.learningProgress.findUnique({ where: { userId } });
}

// "학습 시작해줘" — 이미 진행 중이면 처음부터 다시 시작하지 않고 이어간다
// (재시작은 명시적으로 원할 때만 resetProgress로).
export async function startProgress(userId: string): Promise<LearningProgressData> {
  const existing = await getProgress(userId);
  if (existing && !existing.paused) return existing;
  if (existing && existing.paused) {
    return prisma.learningProgress.update({ where: { userId }, data: { paused: false } });
  }
  return prisma.learningProgress.create({ data: { userId, startDate: todayISO(), currentDay: 1 } });
}

export async function pauseProgress(userId: string): Promise<void> {
  await prisma.learningProgress.updateMany({ where: { userId }, data: { paused: true } });
}

export async function resetProgress(userId: string): Promise<LearningProgressData> {
  return prisma.learningProgress.upsert({
    where: { userId },
    create: { userId, startDate: todayISO(), currentDay: 1 },
    update: { startDate: todayISO(), currentDay: 1, paused: false, streak: 0, lastPushDate: null, lastCompletedDate: null },
  });
}

// 자료를 보여줄 때마다 호출 — 오늘 이미 보여줬는지 판단하는 기준일 뿐,
// 진도(currentDay)는 안 올린다. 진도는 아래 completeCurrentDay만 올린다.
export async function markMaterialShown(userId: string, date: string): Promise<void> {
  await prisma.learningProgress.updateMany({ where: { userId }, data: { lastPushDate: date } });
}

export function isProgramComplete(currentDay: number): boolean {
  return currentDay > TOTAL_DAYS;
}

export type CompleteResult =
  | { ok: true; completedDay: number; nextDay: number }
  | { ok: false; reason: "none" | "paused" | "programComplete" | "already" };

// "학습 완료" — 오늘 하루치를 끝냈다고 사용자가 명시적으로 말했을 때만
// currentDay를 올린다(사용자 기획서 규칙 그대로). 같은 날 두 번 불러도
// 한 번만 올라가게 lastCompletedDate로 막는다.
export async function completeCurrentDay(userId: string, date: string): Promise<CompleteResult> {
  const progress = await getProgress(userId);
  if (!progress) return { ok: false, reason: "none" };
  if (progress.paused) return { ok: false, reason: "paused" };
  if (isProgramComplete(progress.currentDay)) return { ok: false, reason: "programComplete" };
  if (progress.lastCompletedDate === date) return { ok: false, reason: "already" };

  const updated = await prisma.learningProgress.update({
    where: { userId },
    data: { currentDay: { increment: 1 }, lastCompletedDate: date },
  });
  return { ok: true, completedDay: progress.currentDay, nextDay: updated.currentDay };
}

// 사용자가 2026-10-19 공유한 기획서의 "투자 연구 일지" 16개 항목 — date/day
// 빼면 15개. 전부 optional(사용자가 말해준 것만 채워서 기록).
export type JournalEntryInput = {
  marketRegime?: string | null; // 오늘의 시장 상황
  marketCause?: string | null; // 시장을 움직인 핵심 원인
  disclosureNote?: string | null; // 오늘 읽은 중요 공시
  company?: string | null; // 분석한 기업
  companyCode?: string | null;
  businessStructure?: string | null; // 기업의 사업 구조
  earningsChange?: string | null; // 최근 실적 변화
  priceMoveReason?: string | null; // 주가가 움직인 이유
  volumeSupplyNote?: string | null; // 거래량·수급에서 발견한 점
  thesis?: string | null; // 투자 가설
  bullish?: string | null; // 상승 근거
  bearish?: string | null; // 하락 위험
  invalidation?: string | null; // 가설이 틀렸다고 볼 조건
  dataToCheck?: string | null; // 추가로 확인할 데이터
  nextDayCheck?: string | null; // 다음 날 검증할 내용
  learnings?: string | null; // 오늘 새로 배운 것
};

// 오늘치 일지는 하루 하나(덮어쓰기) — 같은 날 여러 번 기록을 보완해도
// 쌓이지 않고 최신 내용으로 합쳐진다. day는 지금 진행 중인 일차(currentDay)
// — 완료 전에 기록하는 게 보통이라 "완료한 날"이 아니라 "작업 중인 날"
// 기준이다. LearningProgress가 없으면(플래닛을 안 쓰는 사람이 그냥 "이
// 종목 분석 기록해줘"라고만 한 경우) 0으로 둔다.
export async function upsertJournalEntry(userId: string, input: JournalEntryInput): Promise<void> {
  const date = todayISO();
  const progress = await getProgress(userId);
  const day = progress ? progress.currentDay : 0;

  const existing = await prisma.learningJournalEntry.findUnique({ where: { userId_date: { userId, date } } });
  await prisma.learningJournalEntry.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, day, ...input },
    update: input,
  });

  // streak는 "연속 평일 기록 일수" — 바로 전 평일에도 일지가 있었어야
  // 이어지고, 하루라도 건너뛰면 1로 리셋한다.
  if (!existing && progress && !progress.paused) {
    const prevEntry = await prisma.learningJournalEntry.findFirst({
      where: { userId, date: { lt: date } },
      orderBy: { date: "desc" },
    });
    const continuous = prevEntry?.date === prevBusinessDay(date);
    await prisma.learningProgress.update({
      where: { userId },
      data: { streak: continuous ? { increment: 1 } : { set: 1 } },
    });
  }
}

export async function getJournalStats(userId: string): Promise<{ total: number; streak: number }> {
  const [total, progress] = await Promise.all([
    prisma.learningJournalEntry.count({ where: { userId } }),
    getProgress(userId),
  ]);
  return { total, streak: progress?.streak ?? 0 };
}

export type JournalEntryData = {
  date: string;
  day: number;
  marketRegime: string | null;
  marketCause: string | null;
  disclosureNote: string | null;
  company: string | null;
  companyCode: string | null;
  businessStructure: string | null;
  earningsChange: string | null;
  priceMoveReason: string | null;
  volumeSupplyNote: string | null;
  thesis: string | null;
  bullish: string | null;
  bearish: string | null;
  invalidation: string | null;
  dataToCheck: string | null;
  nextDayCheck: string | null;
  learnings: string | null;
};

export async function getRecentJournalEntries(userId: string, limit = 10): Promise<JournalEntryData[]> {
  return prisma.learningJournalEntry.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: limit,
  });
}
