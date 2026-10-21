// 골구 AI(Claude) 호출 비용 관측/제어 — 사용자 요청(2026-10-21) 6번
// "토큰·비용 최적화": 호출별 토큰 로그, 일일 예산, 초과 시 처리 정책.
// $ 환산은 일부러 안 한다 — 모델 가격은 바뀔 수 있고, 지금 안다고 확신할
// 수 없는 숫자를 코드에 박아넣는 것보다 토큰 수 자체로 예산을 잡는 게
// 더 정직하다(사용자가 실제 청구서를 보면서 GOLGOO_DAILY_TOKEN_BUDGET
// 값을 조절하면 된다).

import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { todayISO } from "@/lib/dates";

// 입력+출력 토큰 합산 기준 기본값 — Sonnet 채팅 한 번이 보통 수천 토큰
// 수준이라, 하루 수백~천 회는 거뜬히 넘기는 넉넉한 기본치. .env의
// GOLGOO_DAILY_TOKEN_BUDGET으로 실제 사용 패턴 보면서 조절하면 된다.
const DEFAULT_DAILY_TOKEN_BUDGET = 3_000_000;

function dailyTokenBudget(): number {
  const n = Number(process.env.GOLGOO_DAILY_TOKEN_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_TOKEN_BUDGET;
}

// createdAt은 실제 타임스탬프(DateTime)라 KST 하루 경계를 명시적으로
// 잡아야 한다(서버는 UTC) — "+09:00"을 붙여 파싱하면 서버 타임존과
// 무관하게 항상 올바른 KST 자정 기준이 된다.
function kstDayRange(dateISO: string): { start: Date; end: Date } {
  const start = new Date(`${dateISO}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// trigger는 "AI를 왜 불렀는지" 사용량 분석용이지 거래 기록이 아니다 —
// 금액은 이미 ExpenseRecord/IncomeRecord에 정식으로(접근 제어와 함께)
// 저장되니, 여기에 "월급 300만원 받았어"처럼 실제 액수가 평문으로 한 번
// 더 복사돼 남을 이유가 없다(2026-10-21 사용자 확인 후 마스킹 추가).
// "숫자+단위+원" 패턴을 전부 "***원"으로 가린다 — lib/expense-parser.ts가
// 금액을 찾을 때 쓰는 패턴과 같은 모양(억/만/천 단위, 쉼표 포함)이라 실제
// 지출/수입 보고 문장에서 금액만 정확히 가려진다.
const AMOUNT_MASK_RE = /\d[\d,.]*\s*(?:억|만|천)?\s*원/g;

function maskAmounts(text: string): string {
  return text.replace(AMOUNT_MASK_RE, "***원");
}

// 실패해도(DB 순간 장애 등) 실제 채팅 응답을 막으면 안 되니 에러를 삼킨다 —
// 로그가 한 건 빠지는 것보다 사용자가 답을 못 받는 게 훨씬 나쁘다.
export async function logAiCall(input: {
  userId: string | null;
  channel: "web" | "telegram";
  trigger: string;
  usage: Anthropic.Usage;
}): Promise<void> {
  try {
    await prisma.aiCallLog.create({
      data: {
        userId: input.userId,
        channel: input.channel,
        trigger: maskAmounts(input.trigger).slice(0, 120),
        inputTokens: input.usage.input_tokens,
        outputTokens: input.usage.output_tokens,
        cacheReadTokens: input.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: input.usage.cache_creation_input_tokens ?? 0,
      },
    });
  } catch (e) {
    console.error("[ai-usage] logAiCall failed:", e);
  }
}

// 오늘(KST) 호출 전체(사용자 구분 없이 — 이 앱은 1~2명이 쓰는 개인
// 프로젝트라 계정별보다 서비스 전체 예산이 더 의미 있다)의 입력+출력
// 토큰 합. 캐시 읽기 토큰은 실제 과금이 훨씬 싸므로(캐시 적중 시 ~90%
// 할인) 1/10 가중치로만 더한다 — 그대로 더하면 캐싱 덕에 싸진 호출이
// 비싼 호출처럼 예산을 깎아먹는다.
async function todayUsedTokens(): Promise<number> {
  const { start, end } = kstDayRange(todayISO());
  const agg = await prisma.aiCallLog.aggregate({
    where: { createdAt: { gte: start, lt: end } },
    _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true },
  });
  const input = agg._sum.inputTokens ?? 0;
  const output = agg._sum.outputTokens ?? 0;
  const cacheRead = agg._sum.cacheReadTokens ?? 0;
  return input + output + Math.round(cacheRead * 0.1);
}

export async function isOverDailyBudget(): Promise<boolean> {
  try {
    return (await todayUsedTokens()) >= dailyTokenBudget();
  } catch (e) {
    console.error("[ai-usage] isOverDailyBudget check failed — 안전하게 통과시킴:", e);
    return false; // 체크 자체가 실패했다고 채팅을 막으면 안 됨
  }
}

export const DAILY_BUDGET_MESSAGE =
  "오늘 AI 사용량 한도에 도달했어 — 내일 다시 질문받을게. \"점심 9000원\"처럼 단순한 지출/수입 기록은 지금도 그대로 돼(규칙 기반이라 AI를 안 써서).";
