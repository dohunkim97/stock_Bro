// "주식 학습 플래닛" 능동 발송 — 평일 아침 그날의 미션(app/api/cron/daily-
// briefing?slot=morning에 얹는다, lib/portfolio-alerts.ts가 둥지 알림을
// 얹는 것과 같은 방식: Hobby 12개 크론 한도라 새 크론을 못 만든다)과 매주
// 일요일 복습 체크리스트(같은 크론의 날짜가 일요일로 바뀌었을 때) 두 가지.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { saveAssistantBroadcast } from "@/lib/chat-history";
import { todayISO } from "@/lib/dates";
import { dailyTopicFor, DAILY_ROUTINE_STEPS, TOTAL_DAYS } from "@/lib/learning-curriculum";
import { advanceAfterPush, isProgramComplete } from "@/lib/learning-journal";

export type LearningPushSummary = { usersChecked: number; messagesSent: number };

// Day 1~7처럼 고정 질문이 없는 날은 그 주제에 맞는 "오늘의 질문" 하나를
// LLM이 만든다 — 같은 크론 실행 안에서 day가 같으면(시작일이 같은 사용자가
// 여럿이면) 한 번만 호출하고 재사용한다.
const questionCache = new Map<string, string>();

async function generateQuestion(topic: string, monthTitle: string): Promise<string> {
  const key = `${monthTitle}::${topic}`;
  const cached = questionCache.get(key);
  if (cached) return cached;

  const fallback = `오늘 "${topic}"에서 가장 헷갈렸던 부분은 뭐야?`;
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 120,
      system:
        "너는 주식 투자 공부를 매일 시키는 선생님 골구야. 아래 주제에 대한 '오늘의 질문' 딱 한 문장만 만들어 — 초보자가 그 주제를 제대로 이해했는지 스스로 점검할 수 있는 구체적인 질문으로. 질문 문장 하나만 출력하고 다른 말은 하지 마.",
      messages: [{ role: "user", content: `달: ${monthTitle}\n오늘 주제: ${topic}` }],
    });
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text?.trim();
    const question = text || fallback;
    questionCache.set(key, question);
    return question;
  } catch {
    return fallback;
  }
}

// export됨 — lib/golgoo-chat.ts가 "학습 시작해줘"를 받았을 때 다음 날 아침
// 크론까지 안 기다리고 그 자리에서 1일차(또는 이어서 할 일차) 미션을 바로
// 보여주려고 재사용한다.
export async function buildDailyMissionMessage(day: number): Promise<string> {
  const { month, topic, question: fixedQuestion, isWeeklyReview } = dailyTopicFor(day);
  const question = fixedQuestion ?? (await generateQuestion(topic, month.title));

  const header = day === 1 ? "📚 주식 학습 플래닛 — 1일차 시작!" : `📚 주식 학습 플래닛 — ${day}/${TOTAL_DAYS}일차`;
  const lines = [header, `${month.month}개월 차 · ${month.title}`, `오늘 주제: ${topic}`, "", `오늘의 질문: ${question}`];

  if (isWeeklyReview) {
    lines.push("", "오늘은 주간 복습일이야 — 이번 주 배운 걸 안 보고 설명할 수 있는지 먼저 확인해봐.");
  }

  lines.push("", "오늘 루틴(바쁘면 시장 5분·공시뉴스 10분·기업분석 10분·기록 5분으로 줄여도 돼):", ...DAILY_ROUTINE_STEPS);
  lines.push("", "분석 끝나면 그냥 나한테 말해줘 — 투자 가설·근거·위험을 일지로 기록해둘게. 반박해달라거나 공시 해석을 도와달라고 해도 돼.");

  if (day === 1) {
    lines.push(
      "",
      '처음이니까 이것도 알아둬: "오늘 개념 설명해줘"(선생님 모드), "반박해줘"(반대편 분석가), "이 공시 해석해줘", "~기업 질문해줘"(분석 시험관), "내 기록 검토해줘"(지난 가설 vs 실제 결과 비교) — 다 돼. "학습 그만할래"라고 하면 멈출게.'
    );
  }

  return lines.join("\n");
}

// 평일 아침 — 진행 중(paused=false)인 사용자 전원에게 오늘 미션을 보내고
// currentDay를 1 올린다. lastPushDate가 오늘이면 건너뛴다(같은 슬롯이
// 재시도 등으로 두 번 불려도 중복 발송 안 되게).
export async function sendDailyMissions(): Promise<LearningPushSummary> {
  const date = todayISO();
  // lastPushDate가 null인(막 시작한) 사용자도 반드시 걸려야 하는데, SQL의
  // "column != value"는 NULL 행을 자동으로 빼지 않는다고 보장할 수 없어
  // OR로 null 케이스를 명시한다.
  const rows = await prisma.learningProgress.findMany({
    where: { paused: false, OR: [{ lastPushDate: null }, { lastPushDate: { not: date } }] },
    include: { user: { select: { telegramChatId: true } } },
  });

  let usersChecked = 0;
  let messagesSent = 0;

  for (const row of rows) {
    if (!row.user.telegramChatId) continue;
    usersChecked++;

    try {
      // 180일을 다 채운 날 딱 한 번만 완주 축하를 보내고, 그 이후엔
      // lastPushDate만 오늘로 갱신해서(currentDay는 더 안 올림) 매 평일
      // 똑같은 메시지가 반복 발송되지 않게 한다.
      if (isProgramComplete(row.currentDay)) {
        if (row.currentDay === TOTAL_DAYS + 1) {
          const text = `🎉 180일 주식 학습 플래닛을 완주했어! 여기까지 매일 기록한 투자 연구 일지가 네 가장 큰 자산이야 — "내 기록 검토해줘"라고 하면 전체를 같이 돌아볼 수 있어. 다시 처음부터 하고 싶으면 "학습 다시 시작해줘"라고 해줘.`;
          const sent = await sendTelegramMessage(row.user.telegramChatId, text);
          if (sent) {
            messagesSent++;
            await saveAssistantBroadcast(row.userId, date, text);
          }
        }
        await prisma.learningProgress.update({ where: { userId: row.userId }, data: { lastPushDate: date } });
        continue;
      }

      const text = await buildDailyMissionMessage(row.currentDay);
      const sent = await sendTelegramMessage(row.user.telegramChatId, text);
      if (sent) {
        messagesSent++;
        await saveAssistantBroadcast(row.userId, date, text);
        await advanceAfterPush(row.userId, date);
      }
    } catch (e) {
      console.error("[learning-push] daily mission failed for user", row.userId, e);
    }
  }

  return { usersChecked, messagesSent };
}

// 매주 일요일 — 플래닛 원문 그대로의 자기 점검 체크리스트. 코드/LLM 판단이
// 끼어들 게 없는 고정 문구라 매번 똑같이 보낸다.
const SUNDAY_REVIEW_TEXT = [
  "🗓 이번 주 복습 체크리스트",
  "",
  "새 정보를 더 읽지 말고, 이번 주 배운 걸 자기 말로 설명할 수 있는지 점검해봐.",
  "",
  "- 이번 주 공부한 개념 10개를 보지 않고 설명할 수 있는가?",
  "- 기업 하나의 매출과 이익이 왜 변했는지 설명할 수 있는가?",
  "- 주가 상승의 원인을 뉴스·실적·수급으로 나눠 설명할 수 있는가?",
  "- 내 예상과 실제 결과가 달랐던 이유를 분석했는가?",
  "- 다음 주에 보완할 약점 하나를 정했는가?",
  "",
  "점수는 수익률이 아니라 분석의 정확성·근거의 질·기록의 완성도·위험 관리로 매겨. 좋은 분석이었는데 주가는 하락할 수도 있고, 근거가 빈약한 판단이 우연히 맞을 수도 있으니까.",
  "",
  '"내 기록 검토해줘"라고 하면 이번 주 일지를 같이 돌아봐줄게.',
].join("\n");

export async function sendSundayReviews(): Promise<LearningPushSummary> {
  const date = todayISO();
  const rows = await prisma.learningProgress.findMany({
    where: { paused: false },
    include: { user: { select: { telegramChatId: true } } },
  });

  let usersChecked = 0;
  let messagesSent = 0;

  for (const row of rows) {
    if (!row.user.telegramChatId) continue;
    usersChecked++;
    try {
      const sent = await sendTelegramMessage(row.user.telegramChatId, SUNDAY_REVIEW_TEXT);
      if (sent) {
        messagesSent++;
        await saveAssistantBroadcast(row.userId, date, SUNDAY_REVIEW_TEXT);
      }
    } catch (e) {
      console.error("[learning-push] sunday review failed for user", row.userId, e);
    }
  }

  return { usersChecked, messagesSent };
}
