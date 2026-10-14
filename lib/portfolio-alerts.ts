// 둥지 능동적 알림 — "물어봐야만 답하는" 골구에서 "먼저 말 거는" 골구로 가는
// 첫 단계. 텔레그램 chat id를 연결한 사용자에 한해, 종목 판정(lib/holding-
// assessment.ts)이 어제보다 나빠졌으면 코드가 그 사실과 근거를 그대로 문장으로
// 만들어 보낸다 — 여기서도 LLM은 쓰지 않는다(숫자/판정은 이미 코드가 정했고,
// 알릴지 말지도 규칙이라 AI의 해석이 끼어들 자리가 없다).
//
// 트리거(이미 Vercel Hobby 크론 12개가 꽉 차 있어 새 크론을 못 만든다 —
// app/api/cron/intraday-monitor가 장중 매 정시 호출될 때 같이 돈다):
//   1) 상태가 전날 마지막 기록보다 나빠짐(STATE_RANK 상승)
//   2) 그 종목의 판정 기록이 오늘 하루뿐인데(막 샀거나 처음 진단됨) 상태가 이미 축소검토 이상
// 하루 중 같은 악화를 반복 알리지 않게 PortfolioAlertLog(userId+code+date 유일)로
// 막되, 같은 날 더 나빠지면(toState가 바뀌면) 다시 보낸다.

import { prisma } from "@/lib/prisma";
import { getHoldings } from "@/lib/portfolio";
import { getAssessmentReport, type AssessmentReport } from "@/lib/holding-assessment-store";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { STATE_ICON, STATE_RANK, type AssessmentState } from "@/lib/holding-assessment";

export type AlertRunSummary = { usersChecked: number; messagesSent: number };

async function alertLinesFor(userId: string, report: AssessmentReport): Promise<string[]> {
  const date = report.date;
  const lines: string[] = [];

  for (const a of report.assessments) {
    const hist = report.history[a.code];
    const change = hist?.lastChange ?? null;
    const isNewRisky = !change && (hist?.entries.length ?? 0) <= 1 && STATE_RANK[a.state] >= STATE_RANK["축소검토"];
    const worsened = change !== null && STATE_RANK[a.state] > STATE_RANK[change.fromState as AssessmentState];
    if (!worsened && !isNewRisky) continue;

    const existing = await prisma.portfolioAlertLog.findUnique({
      where: { userId_code_date: { userId, code: a.code, date } },
    });
    if (existing && existing.toState === a.state) continue; // 오늘 이미 이 상태로 알림

    await prisma.portfolioAlertLog.upsert({
      where: { userId_code_date: { userId, code: a.code, date } },
      create: { userId, code: a.code, date, toState: a.state },
      update: { toState: a.state },
    });

    const fromLabel = change ? `${STATE_ICON[change.fromState as AssessmentState]}${change.fromState}` : "신규 진단";
    const reasonNote = change && change.reasons.length > 0 ? ` (${change.reasons.join(", ")})` : "";
    lines.push(`${a.name}: ${fromLabel} → ${STATE_ICON[a.state]}${a.state}${reasonNote}`);
  }
  return lines;
}

export async function sendPortfolioAlerts(): Promise<AlertRunSummary> {
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, telegramChatId: true },
  });

  let usersChecked = 0;
  let messagesSent = 0;

  for (const user of users) {
    if (!user.telegramChatId) continue;
    const holdings = await getHoldings(user.id);
    if (holdings.length === 0) continue;
    usersChecked++;

    try {
      const report = await getAssessmentReport(user.id);
      const lines = await alertLinesFor(user.id, report);
      if (lines.length === 0) continue;

      const message = `⚠️ 둥지 알림 (${report.date})\n${lines.join("\n")}\n\n자세한 근거는 둥지에서 확인해줘.`;
      const sent = await sendTelegramMessage(user.telegramChatId, message);
      if (sent) messagesSent++;
    } catch (e) {
      console.error("[portfolio-alerts] failed for user", user.id, e);
    }
  }

  return { usersChecked, messagesSent };
}
