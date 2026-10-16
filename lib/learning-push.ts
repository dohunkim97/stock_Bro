// "주식 학습 플래닛" 자료 제공 — 처음엔 평일 아침 크론이 자동으로 밀어주는
// 방식이었는데, 사용자 피드백(2026-10-16: "자동으로 안보내고 내가 말하면
// 보내줘, 일하느라 까먹을 수도 있으니깐")으로 요청 기반(pull)으로 바꿨다.
// "학습자료 줘"라고 말했을 때만 그 자리에서 다음 미션을 내주고, 그 사이
// 평일을 건너뛰었으면 몇 일 건너뛰었는지도 같이 알려준다. 일지 기록은
// 여전히 lib/learning-journal.ts의 streak(연속 평일 기록 일수)로 추적한다.

import Anthropic from "@anthropic-ai/sdk";
import { todayISO, businessDaysBetweenExclusive } from "@/lib/dates";
import { dailyTopicFor, DAILY_ROUTINE_STEPS, TOTAL_DAYS } from "@/lib/learning-curriculum";
import { getProgress, startProgress, resetProgress, advanceAfterPush, isProgramComplete } from "@/lib/learning-journal";

// Day 1~7처럼 고정 질문이 없는 날은 그 주제에 맞는 "오늘의 질문" 하나를
// LLM이 만든다. 같은 서버 인스턴스에서 반복 요청되면 재사용(요청마다 매번
// 다른 질문이 나오면 "오늘 미션 다시 보여줘" 했을 때 내용이 바뀌어 보임).
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

export async function buildDailyMissionMessage(day: number): Promise<string> {
  const { month, topic, question: fixedQuestion, isWeeklyReview } = dailyTopicFor(day);
  const question = fixedQuestion ?? (await generateQuestion(topic, month.title));

  const header = day === 1 ? "📚 주식 학습 플래닛 — 1일차" : `📚 주식 학습 플래닛 — ${day}/${TOTAL_DAYS}일차`;
  const lines = [header, `${month.month}개월 차 · ${month.title}`, `오늘 주제: ${topic}`, "", `오늘의 질문: ${question}`];

  if (isWeeklyReview) {
    lines.push("", "오늘은 주간 복습일이야 — 이번 주 배운 걸 안 보고 설명할 수 있는지 먼저 확인해봐.");
  }

  lines.push("", "오늘 루틴(바쁘면 시장 5분·공시뉴스 10분·기업분석 10분·기록 5분으로 줄여도 돼):", ...DAILY_ROUTINE_STEPS);
  lines.push("", "분석 끝나면 그냥 나한테 말해줘 — 투자 가설·근거·위험을 일지로 기록해둘게. 반박해달라거나 공시 해석을 도와달라고 해도 돼.");

  if (day === 1) {
    lines.push(
      "",
      '이것도 알아둬: "오늘 개념 설명해줘"(선생님 모드), "반박해줘"(반대편 분석가), "이 공시 해석해줘", "~기업 질문해줘"(분석 시험관), "내 기록 검토해줘"(지난 가설 vs 실제 결과 비교) — 다 돼. 다음 자료는 자동으로 안 오고 "학습자료 줘"라고 말할 때만 줄게. "학습 그만할래"라고 하면 멈출게.'
    );
  }

  return lines.join("\n");
}

const COMPLETE_TEXT =
  '🎉 180일 주식 학습 플래닛을 완주했어! 여기까지 매일 기록한 투자 연구 일지가 네 가장 큰 자산이야 — "내 기록 검토해줘"라고 하면 전체를 같이 돌아볼 수 있어. 다시 처음부터 하고 싶으면 "학습 다시 시작해줘"라고 해줘.';

// "학습자료 줘" — 핵심 진입점. 아직 시작 안 했으면 그 자리에서 1일차부터
// 시작하고, 멈춰 있었으면 이어서 재개하고, 이미 진행 중이면 다음 일차를
// 내준다. 오늘 이미 받았으면(중복 요청) 같은 내용을 다시 보여주고 진도는
// 더 안 나간다. 마지막 요청 이후 평일을 건너뛰었으면 그 사실도 먼저 알려준다.
export async function pullTodayMaterial(userId: string): Promise<string> {
  const today = todayISO();
  let progress = await getProgress(userId);
  const wasPaused = progress?.paused ?? false;

  if (!progress || isProgramComplete(progress.currentDay)) {
    progress = progress && isProgramComplete(progress.currentDay) ? await resetProgress(userId) : await startProgress(userId);
  } else if (progress.paused) {
    progress = await startProgress(userId); // 멈춰 있었으면 요청한 김에 재개
  }

  if (isProgramComplete(progress.currentDay)) return COMPLETE_TEXT;

  const resumeNote = wasPaused ? "⏸ 멈춰 있던 거 다시 시작할게.\n\n" : "";

  if (progress.lastPushDate === today) {
    // 오늘 이미 받은 자료를 또 요청 — 같은 날짜 안에서는 진도를 더
    // 안 올리고 방금 준 그 미션을 그대로 다시 보여준다.
    const day = Math.max(1, progress.currentDay - 1);
    return resumeNote + (await buildDailyMissionMessage(day));
  }

  const skipped = progress.lastPushDate ? businessDaysBetweenExclusive(progress.lastPushDate, today) : 0;
  const missionText = await buildDailyMissionMessage(progress.currentDay);
  await advanceAfterPush(userId, today);

  const skipNote = skipped > 0 ? `지난 ${skipped}일(평일 기준) 건너뛰었네 — 괜찮아, 이어서 할게.\n\n` : "";
  return resumeNote + skipNote + missionText;
}

// 플래닛 원문 그대로의 일요일 자기 점검 체크리스트 — "주간 복습 보여줘"
// 같은 요청에 그대로 relay한다(lib/telegram-chat.ts). 코드/LLM 판단이
// 끼어들 게 없는 고정 문구라 매번 똑같다.
export const SUNDAY_REVIEW_TEXT = [
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
