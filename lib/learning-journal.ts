// "주식 학습 플래닛" 진행 상태(LearningProgress)와 일지(LearningJournalEntry)
// CRUD — lib/learning-push.ts(평일 미션 발송)와 lib/golgoo-chat.ts(일지 기록
// 도구, 시작/중지 명령)가 공유한다.

import { prisma } from "@/lib/prisma";
import { todayISO, prevBusinessDay } from "@/lib/dates";
import { TOTAL_DAYS } from "@/lib/learning-curriculum";

export type LearningProgressData = {
  userId: string;
  startDate: string;
  currentDay: number;
  lastPushDate: string | null;
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
    update: { startDate: todayISO(), currentDay: 1, paused: false, streak: 0, lastPushDate: null },
  });
}

// 학습자료를 내줄 때(사용자가 "학습자료 줘"로 요청할 때만 — 평일 아침에
// 자동으로 보내던 건 뺐다, 2026-10-16 사용자 피드백: "자동으로 안보내고
// 내가 말하면 보내줘") 1씩 올리고(180일 넘으면 더 안 올림), 같은 날 다시
// 요청하면 중복으로 안 올리게 lastPushDate를 같이 기록한다. 이 lastPushDate
// 는 이제 "마지막으로 학습자료를 받은 날"이라는 뜻이고, 다음 요청 때 그
// 사이 평일을 건너뛰었는지 계산하는 기준점으로도 쓰인다.
export async function advanceAfterPush(userId: string, date: string): Promise<void> {
  await prisma.learningProgress.updateMany({
    where: { userId },
    data: { currentDay: { increment: 1 }, lastPushDate: date },
  });
}

export function isProgramComplete(currentDay: number): boolean {
  return currentDay > TOTAL_DAYS;
}

export type JournalEntryInput = {
  marketRegime?: string | null;
  company?: string | null;
  companyCode?: string | null;
  thesis?: string | null;
  bullish?: string | null;
  bearish?: string | null;
  invalidation?: string | null;
  learnings?: string | null;
};

// 오늘치 일지는 하루 하나(덮어쓰기) — 같은 날 여러 번 기록을 보완해도
// 쌓이지 않고 최신 내용으로 합쳐진다. day는 LearningProgress가 있으면 그
// currentDay-1(방금 받은 미션의 날짜)을, 없으면(플래닛을 안 쓰는 사람이
// 그냥 "오늘 이 종목 분석 기록해줘"라고만 한 경우) 0으로 둔다.
export async function upsertJournalEntry(userId: string, input: JournalEntryInput): Promise<void> {
  const date = todayISO();
  const progress = await getProgress(userId);
  const day = progress ? Math.max(1, progress.currentDay - 1) : 0;

  const existing = await prisma.learningJournalEntry.findUnique({ where: { userId_date: { userId, date } } });
  await prisma.learningJournalEntry.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, day, ...input },
    update: input,
  });

  // streak는 "연속 평일 기록 일수" — 바로 전 평일에도 일지가 있었어야
  // 이어지고, 하루라도 건너뛰면 1로 리셋한다(예전엔 그냥 매번 +1이라 중간에
  // 며칠 빠져도 계속 올라가는 버그가 있었다).
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
  company: string | null;
  companyCode: string | null;
  thesis: string | null;
  bullish: string | null;
  bearish: string | null;
  invalidation: string | null;
  learnings: string | null;
};

export async function getRecentJournalEntries(userId: string, limit = 10): Promise<JournalEntryData[]> {
  return prisma.learningJournalEntry.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: limit,
  });
}
