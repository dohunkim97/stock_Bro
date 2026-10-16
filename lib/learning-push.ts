// "주식 학습 플래닛" 자료 제공.
// 2026-10-16 사용자 피드백 2건을 반영한 현재 형태:
//  1) "자동으로 안보내고 내가 말하면 보내줘" → 평일 아침 자동 발송을 없애고
//     요청 기반(pull)으로 전환(pullTodayMaterial).
//  2) "강의형으로 하고 골구 판단으로 정리, 그리고 내가 보고 궁금한 거
//     질문하는 식으로" → 처음엔 "오늘의 질문 + 혼자 조사해서 답해와" 숙제
//     형이었는데, 그 대신 그날 주제를 골구가 먼저 강의처럼 설명하고 요약
//     판단까지 준 다음, 사용자가 읽고 이상하거나 궁금한 걸 되묻는 흐름으로
//     바꿨다(buildDailyMissionMessage가 매번 LLM 강의를 생성).
// DAILY_ROUTINE_STEPS(원문의 6단계 "스스로 조사" 루틴)는 더 이상 기본
// 발송에 안 들어간다 — 완전히 안 쓰는 건 아니고, 커리큘럼 데이터로는 남겨둔
// 채 나중에 "오늘 실습 체크리스트 줘" 같은 별도 요청용으로 쓸 수 있다.

import Anthropic from "@anthropic-ai/sdk";
import { todayISO, businessDaysBetweenExclusive } from "@/lib/dates";
import { dailyTopicFor, TOTAL_DAYS } from "@/lib/learning-curriculum";
import { getProgress, startProgress, resetProgress, advanceAfterPush, isProgramComplete } from "@/lib/learning-journal";

// 같은 주제를 다시 보여줄 때(같은 날 재요청, 같은 날 시작한 다른 사용자)
// 매번 새로 생성하면 내용이 바뀌어 보이고 비용도 드니 재사용한다.
const lectureCache = new Map<string, string>();

const LECTURE_SYSTEM = [
  "너는 주식 투자 공부를 매일 가르치는 선생님 골구야. 아래 '오늘 주제'를 초보자 기준으로 강의해.",
  "순서: ①정의 ②작동 원리 ③숫자가 들어간 구체적 예시 ④초보자가 흔히 하는 오해 ⑤골구의 한 줄 정리(이게 실전 투자에서 왜 중요한지, 네 판단). 이 다섯 항목을 반드시 전부 끝까지 채워 — 중간에 잘리면 안 돼.",
  "각 항목은 2~4문장으로 간결하게(텔레그램 메시지라 너무 길면 안 읽혀). 전체 분량을 꼭 지켜서 다섯 항목 모두 자연스럽게 끝맺어.",
  "전문 용어는 풀어서 설명해. 핵심 용어·숫자·결론은 **이렇게** 두 개의 별표로 감싸서 강조해(텔레그램에서 실제로 굵게 보여) — 단, 문단 전체나 문장 전체를 감싸지 말고 꼭 필요한 단어·숫자만. 표는 쓰지 마(안 예쁘게 나와). 문단은 줄바꿈으로만 구분해.",
  "예시로 드는 숫자는 '예를 들어'라고 분명히 밝힌 가상의 예시여야 해 — 실제 특정 종목의 현재 수치인 것처럼 단정하지 마(네가 실시간 데이터를 보고 있는 게 아니니까).",
].join(" ");

async function generateLecture(topic: string, monthTitle: string, anchorQuestion: string | null): Promise<string> {
  const key = `${monthTitle}::${topic}`;
  const cached = lectureCache.get(key);
  if (cached) return cached;

  const fallback = `(오늘 "${topic}"에 대한 강의를 못 불러왔어 — "오늘 개념 설명해줘"라고 다시 물어봐줄래?)`;
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1400,
      system:
        LECTURE_SYSTEM +
        (anchorQuestion
          ? ` 설명 안에 이 질문에 대한 답도 자연스럽게 포함해: "${anchorQuestion}"`
          : " 마지막엔 오늘 내용을 스스로 점검할 수 있는 질문 1개를 '스스로 점검:'으로 시작해서 덧붙여."),
      messages: [{ role: "user", content: `달: ${monthTitle}\n오늘 주제: ${topic}` }],
    });
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text?.trim();
    const lecture = text || fallback;
    lectureCache.set(key, lecture);
    return lecture;
  } catch {
    return fallback;
  }
}

export async function buildDailyMissionMessage(day: number): Promise<string> {
  const { month, topic, question: fixedQuestion, isWeeklyReview } = dailyTopicFor(day);
  const lecture = await generateLecture(topic, month.title, fixedQuestion);

  const header = day === 1 ? "📚 주식 학습 플래닛 — 1일차" : `📚 주식 학습 플래닛 — ${day}/${TOTAL_DAYS}일차`;
  const lines = [header, `${month.month}개월 차 · ${month.title} — ${topic}`, "", lecture];

  if (fixedQuestion) lines.push("", `스스로 점검: ${fixedQuestion}`);
  if (isWeeklyReview) lines.push("", "오늘은 주간 복습일이야 — 이번 주 배운 것들도 한번 돌아봐.");

  lines.push("", "이상하거나 더 궁금한 거 있으면 바로 물어봐. 오늘 실제로 분석해본 종목이 있으면 그것도 말해줘 — 일지로 기록해둘게.");

  if (day === 1) {
    lines.push(
      "",
      '이것도 알아둬: "반박해줘"(반대편 분석가), "이 공시 해석해줘", "~기업 질문해줘"(분석 시험관), "내 기록 검토해줘"(지난 가설 vs 실제 결과 비교) — 다 돼. 다음 자료는 자동으로 안 오고 "학습자료 줘"라고 말할 때만 줄게. "학습 그만할래"라고 하면 멈출게.'
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
