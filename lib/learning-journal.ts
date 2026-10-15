// "주식 학습 플래닛" 진행 상태(LearningProgress)와 일지(LearningJournalEntry)
// CRUD — lib/learning-push.ts(평일 미션 발송)와 lib/golgoo-chat.ts(일지 기록
// 도구, 시작/중지 명령)가 공유한다.

import { prisma } from "@/lib/prisma";
import { todayISO } from "@/lib/dates";
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

// 평일 미션을 보낼 때 1씩 올리고(180일 넘으면 더 안 보냄), 같은 날 두 번
// 안 보내게 lastPushDate를 같이 기록한다.
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

  if (!existing && progress && !progress.paused) {
    await prisma.learningProgress.update({ where: { userId }, data: { streak: { increment: 1 } } });
  }
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
