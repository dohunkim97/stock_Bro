// 골구 채팅의 공통 엔진 — 웹(app/api/bro/route.ts)과 텔레그램(lib/telegram-chat.ts)
// 양쪽이 이 한 함수(runChatTurn)를 그대로 호출한다. 도구 정의·숫자 계산(매수/
// 지출 기록, 카드 조정)은 전부 여기 있고, 두 호출부는 각자의 입출력 형식(HTTP
// JSON vs 텔레그램 메시지)만 다루게 얇게 둔다 — 로직이 두 곳에서 따로 썩지
// 않게. cards를 안 주면(텔레그램) adjust_strategy 도구 자체를 안 준다 — 화면에
// 떠 있는 카드라는 개념이 텔레그램엔 없어서.

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/bro-context";
import { saveChatTurn } from "@/lib/chat-history";
import { todayISO } from "@/lib/dates";
import { findMentionedStocks, buildStockReport, stockContextBlock } from "@/lib/chat-stock-report";
import type { CandidateDetail } from "@/lib/candidate-detail";
import { fetchKisQuote } from "@/lib/kis-quote";
import {
  addHolding,
  computeOverview,
  getHoldingsWithLiveData,
  getPortfolioSettings,
  resolveHoldingCode,
} from "@/lib/portfolio";
import { addExpenseRecord, addIncomeRecord, addLiability, addFinancialGoal, getExpenseSummary } from "@/lib/finance-engine";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance-constants";
import { prisma } from "@/lib/prisma";
import { upsertThesis } from "@/lib/holding-thesis";
import { resolveStock } from "@/lib/market-data";
import { getAssessmentReport } from "@/lib/holding-assessment-store";
import { buildHoldingDeepDiveBlock, buildRiskTopBlock, buildScenarioBlock, buildNewsImpactBlock } from "@/lib/golgoo-deep-dive";
import { cumulativeLearningBlock } from "@/lib/prediction-learning";
import { fetchKisChart } from "@/lib/kis-chart";
import { dailyTopicFor } from "@/lib/learning-curriculum";
import { getProgress, pauseProgress, upsertJournalEntry, getRecentJournalEntries, getJournalStats } from "@/lib/learning-journal";
import { pullTodayMaterial } from "@/lib/learning-push";
import { searchEncyclopedia } from "@/lib/naver-encyc";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// 골구 워크스페이스 좌측 피드에 지금 떠 있는 카드 — adjust_strategy 도구가
// "화면에 있는 카드만" 건드리도록 프론트가 매 요청마다 같이 보내준다.
export type CardRef = { code: string; name: string; entryPrice: number | null; targetPrice: number | null; stopLossPrice: number | null };

const ADJUST_TOOL: Anthropic.Tool = {
  name: "adjust_strategy",
  description:
    "이미 화면에 표시된 종목 카드의 목표가·손절가를 사용자 요청에 맞게 조정한다. 사용자가 '더 낮춰줘', '타이트하게' 같은 조정을 요청했을 때만 호출해 — 새로 종목을 조회/설명하는 것뿐이면 호출하지 마.",
  input_schema: {
    type: "object",
    properties: {
      code: { type: "string", description: "조정할 종목의 코드 — 반드시 [지금 화면에 떠 있는 카드] 목록에 있는 코드만" },
      targetPricePct: {
        type: "number",
        description: "기존 목표가 대비 조정 비율(%). 10% 낮추면 -10, 5% 높이면 5. 조정 안 하면 이 필드는 생략.",
      },
      stopLossPricePct: {
        type: "number",
        description: "기존 손절가 대비 조정 비율(%). '타이트하게'는 보통 손절폭을 줄이는 것(현재가에 더 가깝게). 조정 안 하면 이 필드는 생략.",
      },
    },
    required: ["code"],
  },
};

export type CardUpdate = { code: string; targetPrice: number | null; targetPct: number | null; stopLossPrice: number | null; note: string };

// "LG에너지솔루션 100만원 샀어", "삼성전자 10주 85000원에 샀어" 같은 실제
// 매수 보고를 들었을 때만 호출하는 도구 — 둥지(내 보유 종목, lib/portfolio.ts)
// 에 매수 건을 기록한다. 로그인하지 않은 사용자에게는 이 도구 자체를 주지
// 않는다(아래 tools 배열 구성부). 숫자 계산(수량·단가 역산, 종목코드 조회,
// 실제 DB 기록)은 전부 서버가 하고, 모델은 "사용자가 뭘 샀다고 말했는지"
// 추출만 담당한다 — adjust_strategy와 같은 원칙.
const RECORD_HOLDING_TOOL: Anthropic.Tool = {
  name: "record_holding_purchase",
  description:
    "사용자가 실제로 특정 '주식 종목'을 매수했다고 말했을 때만 호출해(예: 'LG에너지솔루션 100만원 샀어', '삼성전자 10주 85000원에 샀어'). " +
    "일상적인 지출(식비·쇼핑 등)은 이 도구가 아니라 record_expense를 써. 단순히 종목에 대해 묻거나 의견을 구하는 것뿐이면 호출하지 마. " +
    "quantity(수량)·pricePerShare(주당 매수가)·totalAmount(총 매수금액) 중 최소 하나는 사용자가 말해야 호출할 수 있어 — " +
    "아무 숫자도 없으면 호출하지 말고 먼저 얼마에 몇 주 샀는지 되물어봐. " +
    "한 메시지에 여러 종목을 샀다고 하면(예: 'A전자 10주, B에너지 5주 샀어') 이 도구를 종목 수만큼 여러 번 호출해 — 하나만 부르고 넘어가지 마.",
  input_schema: {
    type: "object",
    properties: {
      stockName: { type: "string", description: "매수한 종목의 정확한 한글 종목명" },
      quantity: { type: "number", description: "매수 수량(주). 모르면 생략." },
      pricePerShare: { type: "number", description: "주당 매수가(원). 모르면 생략." },
      totalAmount: {
        type: "number",
        description: "총 매수금액(원). 사용자가 '100만원어치 샀어'처럼 총액만 말했을 때 사용. 모르면 생략.",
      },
    },
    required: ["stockName"],
  },
};

type RecordHoldingResult = { ok: boolean; message: string; name?: string; code?: string; quantity?: number; buyPrice?: number };

// 모델이 준 입력(수량/단가/총액 중 일부)만으로는 둘 다 못 정하는 경우가
// 있다 — 그럴 땐 실제로 기록하는 대신 무엇이 더 필요한지 되묻는 메시지를
// 돌려준다(어설픈 추측으로 틀린 금액을 기록하지 않기 위함).
async function recordHoldingPurchase(
  userId: string,
  input: { stockName?: unknown; quantity?: unknown; pricePerShare?: unknown; totalAmount?: unknown }
): Promise<RecordHoldingResult> {
  const stockName = typeof input.stockName === "string" ? input.stockName.trim() : "";
  if (!stockName) return { ok: false, message: "어떤 종목인지 못 들었어. 종목명을 다시 말해줄래?" };

  const quantity = typeof input.quantity === "number" && input.quantity > 0 ? input.quantity : null;
  const pricePerShare = typeof input.pricePerShare === "number" && input.pricePerShare > 0 ? input.pricePerShare : null;
  const totalAmount = typeof input.totalAmount === "number" && input.totalAmount > 0 ? input.totalAmount : null;

  if (quantity === null && pricePerShare === null && totalAmount === null) {
    return { ok: false, message: `${stockName} 몇 주를, 또는 얼마에 샀는지 말해줄래? 둥지에 기록해둘게.` };
  }

  const resolved = await resolveHoldingCode(stockName);
  if (!resolved) return { ok: false, message: `"${stockName}" 종목을 찾지 못했어. 종목명을 다시 확인해줄래?` };

  let finalQuantity = quantity;
  let finalPrice = pricePerShare;
  let priceIsAssumed = false;

  if (finalQuantity !== null && finalPrice === null && totalAmount !== null) {
    finalPrice = totalAmount / finalQuantity;
  } else if (finalQuantity === null && finalPrice !== null && totalAmount !== null) {
    finalQuantity = totalAmount / finalPrice;
  } else if (finalQuantity === null && finalPrice === null && totalAmount !== null) {
    // 수량·단가 둘 다 없이 총액만 말한 경우 — 지금 시세로 주당 가격을
    // 추정해 수량을 역산한다(실제 체결가와 다를 수 있어 응답에 명시).
    const quote = await fetchKisQuote(resolved.code).catch(() => null);
    if (!quote) return { ok: false, message: `${resolved.name} 현재가를 못 가져와서 수량을 못 정했어. 몇 주 샀는지 알려줄래?` };
    finalPrice = quote.price;
    finalQuantity = totalAmount / finalPrice;
    priceIsAssumed = true;
  } else if (finalQuantity !== null && finalPrice === null) {
    const quote = await fetchKisQuote(resolved.code).catch(() => null);
    if (!quote) return { ok: false, message: `${resolved.name} 매수가를 몰라서 기록 못 했어. 얼마에 샀는지 알려줄래?` };
    finalPrice = quote.price;
    priceIsAssumed = true;
  } else if (finalQuantity === null && finalPrice !== null) {
    return { ok: false, message: `${resolved.name} 몇 주 샀는지 알려줄래? 가격은 받았어.` };
  }

  if (finalQuantity === null || finalPrice === null || finalQuantity <= 0 || finalPrice <= 0) {
    return { ok: false, message: `${resolved.name} 수량과 매수가를 정하지 못해서 기록 못 했어.` };
  }

  const roundedQuantity = Math.max(1, Math.round(finalQuantity));
  const roundedPrice = Math.round(finalPrice);

  await addHolding(userId, {
    name: resolved.name,
    code: resolved.code,
    buyPrice: roundedPrice,
    quantity: roundedQuantity,
    buyDate: todayISO(),
  });

  const total = roundedQuantity * roundedPrice;
  const assumedNote = priceIsAssumed ? " (매수가는 현재 시세로 추정했어, 실제 체결가가 다르면 둥지에서 고쳐줘)" : "";
  return {
    ok: true,
    message: `✅ 둥지에 **${resolved.name} ${roundedQuantity}주**, 매수가 **₩${roundedPrice.toLocaleString()}** (총 ₩${total.toLocaleString()}) 기록했어.${assumedNote}`,
    name: resolved.name,
    code: resolved.code,
    quantity: roundedQuantity,
    buyPrice: roundedPrice,
  };
}

// 일상 지출 보고("커피 5천원 썼어", "점심 만원 결제했어")를 들었을 때 호출하는
// 도구 — 둥지 수입·지출·부채(lib/finance-engine.ts)에 지출 한 건을 기록한다.
// record_holding_purchase와 같은 원칙: 모델은 추출만, 숫자 기록은 서버가.
const RECORD_EXPENSE_TOOL: Anthropic.Tool = {
  name: "record_expense",
  description:
    "사용자가 실제로 돈을 썼다고 말했을 때만 호출해(예: '커피 5천원 썼어', '점심 만원 결제했어', '옷 사는데 8만원 썼어'). " +
    "'주식 샀어'처럼 종목 매수면 이 도구 대신 record_holding_purchase를 써. amount(금액)는 필수고, 못 들었으면 호출하지 말고 얼마 썼는지 되물어봐. " +
    "한 메시지에 여러 지출을 한 번에 말하면(예: '과자 5만원, 음료 2만원 썼어') 이 도구를 지출 건수만큼 각각 따로 호출해 — 첫 건만 부르고 끝내지 마.",
  input_schema: {
    type: "object",
    properties: {
      amount: { type: "number", description: "지출 금액(원). 필수." },
      category: {
        type: "string",
        enum: [...EXPENSE_CATEGORIES],
        description: "가장 가까운 카테고리 하나를 골라. 애매하면 '기타'.",
      },
      memo: { type: "string", description: "무엇에 썼는지 짧은 메모(예: '스타벅스 커피'). 모르면 생략." },
    },
    required: ["amount"],
  },
};

type RecordExpenseResult = { ok: boolean; message: string };

// export됨 — lib/telegram-chat.ts가 영수증 사진 OCR(이미 구조화된 결과)을
// 도구 왕복 없이 바로 기록할 때도 이 함수를 그대로 쓴다.
export async function recordExpense(
  userId: string,
  input: { amount?: unknown; category?: unknown; memo?: unknown }
): Promise<RecordExpenseResult> {
  const amount = typeof input.amount === "number" && input.amount > 0 ? Math.round(input.amount) : null;
  if (amount === null) return { ok: false, message: "얼마 썼는지 금액을 말해줄래?" };

  const category = typeof input.category === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(input.category)
    ? input.category
    : "기타";
  const memo = typeof input.memo === "string" && input.memo.trim() ? input.memo.trim() : undefined;

  await addExpenseRecord(userId, { date: todayISO(), category, amount, memo });

  return { ok: true, message: `✅ 지출 기록했어: ${category} **₩${amount.toLocaleString()}**${memo ? ` (${memo})` : ""}` };
}

// 일상 수입 보고("월급 300만원 들어왔어", "부업으로 20만원 벌었어")를 들었을 때
// 호출하는 도구 — record_expense와 반대쪽. 숫자 기록은 서버가, 모델은 추출만.
const RECORD_INCOME_TOOL: Anthropic.Tool = {
  name: "record_income",
  description:
    "사용자가 실제로 돈이 들어왔다고 말했을 때만 호출해(예: '월급 300만원 들어왔어', '부업으로 20만원 벌었어', '보너스 50만원 받았어'). " +
    "돈을 쓴 거면(지출) 이 도구 대신 record_expense를 써. amount(금액)는 필수고, 못 들었으면 호출하지 말고 되물어봐. " +
    "한 메시지에 여러 건을 말하면 건수만큼 각각 호출해.",
  input_schema: {
    type: "object",
    properties: {
      amount: { type: "number", description: "수입 금액(원). 필수." },
      category: { type: "string", enum: [...INCOME_CATEGORIES], description: "가장 가까운 카테고리 하나. 애매하면 '기타'." },
      memo: { type: "string", description: "짧은 메모. 모르면 생략." },
    },
    required: ["amount"],
  },
};

type RecordIncomeResult = { ok: boolean; message: string };

async function recordIncome(userId: string, input: { amount?: unknown; category?: unknown; memo?: unknown }): Promise<RecordIncomeResult> {
  const amount = typeof input.amount === "number" && input.amount > 0 ? Math.round(input.amount) : null;
  if (amount === null) return { ok: false, message: "얼마 들어왔는지 금액을 말해줄래?" };
  const category =
    typeof input.category === "string" && (INCOME_CATEGORIES as readonly string[]).includes(input.category) ? input.category : "기타";
  const memo = typeof input.memo === "string" && input.memo.trim() ? input.memo.trim() : undefined;
  await addIncomeRecord(userId, { date: todayISO(), category, amount, memo });
  return { ok: true, message: `✅ 수입 기록했어: ${category} **₩${amount.toLocaleString()}**${memo ? ` (${memo})` : ""}` };
}

// 새 대출/빚이 생겼다는 보고("학자금 대출 500만원 받았어")를 들었을 때 호출 —
// 기존 부채 수정/상환 완료는 아직 이 도구 범위 밖(새 행 추가만).
const RECORD_LIABILITY_TOOL: Anthropic.Tool = {
  name: "record_liability",
  description:
    "사용자가 새로운 대출/빚이 생겼다고 말했을 때만 호출해(예: '학자금 대출 500만원 받았어', '카드론 300만원 있어'). " +
    "기존 빚의 상환이나 금액 수정 요청이면 이 도구를 쓰지 말고 둥지(수입·지출·부채 탭)에서 직접 고치라고 안내해. principal(원금)은 필수. " +
    "한 메시지에 여러 건을 말하면 건수만큼 각각 호출해.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "부채 이름(예: '학자금 대출'). 모르면 생략." },
      type: { type: "string", enum: ["신용대출", "전세자금대출", "카드론", "기타"], description: "모르면 '기타'." },
      principal: { type: "number", description: "원금(원). 필수." },
      interestRate: { type: "number", description: "연 금리(%). 모르면 생략(0으로 기록)." },
    },
    required: ["principal"],
  },
};

type RecordLiabilityResult = { ok: boolean; message: string };

async function recordLiability(
  userId: string,
  input: { name?: unknown; type?: unknown; principal?: unknown; interestRate?: unknown }
): Promise<RecordLiabilityResult> {
  const principal = typeof input.principal === "number" && input.principal > 0 ? Math.round(input.principal) : null;
  if (principal === null) return { ok: false, message: "원금이 얼마인지 말해줄래?" };
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : "대출";
  const type =
    typeof input.type === "string" && ["신용대출", "전세자금대출", "카드론", "기타"].includes(input.type) ? input.type : "기타";
  const interestRate = typeof input.interestRate === "number" && input.interestRate >= 0 ? input.interestRate : 0;
  await addLiability(userId, { name, type, principal, interestRate });
  return { ok: true, message: `✅ 부채 기록했어: ${name} **₩${principal.toLocaleString()}** (금리 ${interestRate}%)` };
}

// 새 재무 목표 추가("2030년까지 1억 모으기 목표 추가해줘") — targetDate 없이는
// lib/finance-goal-math.ts의 달성일 계산이 안 돼서 반드시 받아야 한다.
const ADD_GOAL_TOOL: Anthropic.Tool = {
  name: "add_financial_goal",
  description:
    "사용자가 새 저축/투자 목표를 만들어달라고 했을 때만 호출해(예: '2030년까지 1억 모으기 목표 추가해줘'). " +
    "targetAmount와 targetDate가 둘 다 있어야 호출할 수 있어 — 목표일을 안 말했으면 호출하지 말고 먼저 언제까지인지 물어봐. " +
    "targetDate는 반드시 YYYY-MM-DD로 변환해(예: '2030년까지'면 2030-12-31).",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "목표 이름(예: '첫 1억'). 모르면 금액 기반으로 자동 생성." },
      targetAmount: { type: "number", description: "목표 금액(원). 필수." },
      targetDate: { type: "string", description: "목표일 YYYY-MM-DD. 필수." },
      monthlyContribution: { type: "number", description: "현재 월 투자금(원). 모르면 0." },
    },
    required: ["targetAmount", "targetDate"],
  },
};

type AddGoalResult = { ok: boolean; message: string };

async function addGoalFromChat(
  userId: string,
  input: { name?: unknown; targetAmount?: unknown; targetDate?: unknown; monthlyContribution?: unknown }
): Promise<AddGoalResult> {
  const targetAmount = typeof input.targetAmount === "number" && input.targetAmount > 0 ? Math.round(input.targetAmount) : null;
  const targetDate = typeof input.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.targetDate) ? input.targetDate : null;
  if (targetAmount === null || targetDate === null) {
    return { ok: false, message: "목표 금액이랑 언제까지인지(연도면 충분해) 둘 다 말해줄래?" };
  }
  const monthlyContribution =
    typeof input.monthlyContribution === "number" && input.monthlyContribution >= 0 ? input.monthlyContribution : 0;
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : `${targetAmount.toLocaleString()}원 목표`;
  await addFinancialGoal(userId, { name, targetAmount, targetDate, monthlyContribution });
  return { ok: true, message: `✅ 목표 추가했어: ${name}, ${targetDate}까지 ₩${targetAmount.toLocaleString()}` };
}

// module ③/⑩ — "왜 이 종목을 샀는지"를 말해주면 기록해둔다. 다음에 이
// 종목에 대해 "보유 이유 아직 유효해?"라고 물으면(lib/golgoo-deep-dive.ts)
// 이 기록과 지금 신호를 대조한다. 종목당 하나로 덮어쓴다(과거 버전 보관
// 안 함, Phase 1 범위).
const RECORD_THESIS_TOOL: Anthropic.Tool = {
  name: "record_investment_thesis",
  description:
    "사용자가 '왜 이 종목을 샀는지/계속 들고 있는지' 투자 논리를 말했을 때 호출해(예: 'LG에너지솔루션은 2차전지 수요 때문에 샀어', " +
    "'삼성전자는 반도체 업황 회복 보고 들고 있어'). 종목명을 정확히 특정할 수 있을 때만 호출하고, 애매하면 어떤 종목인지 먼저 물어봐.",
  input_schema: {
    type: "object",
    properties: {
      stockName: { type: "string", description: "종목명" },
      reason: { type: "string", description: "매수/보유 이유" },
      invalidation: { type: "string", description: "이 논리가 깨지는 조건(예: '영업이익률이 계속 떨어지면'). 사용자가 말했으면만." },
    },
    required: ["stockName", "reason"],
  },
};

type RecordThesisResult = { ok: boolean; message: string };

async function recordThesis(
  userId: string,
  input: { stockName?: unknown; reason?: unknown; invalidation?: unknown }
): Promise<RecordThesisResult> {
  const stockName = typeof input.stockName === "string" ? input.stockName.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!stockName || !reason) return { ok: false, message: "어떤 종목인지랑 왜 샀는지 둘 다 말해줄래?" };
  const resolved = await resolveStock(stockName);
  if (!resolved) return { ok: false, message: `"${stockName}" 종목을 찾지 못했어.` };
  const invalidation = typeof input.invalidation === "string" && input.invalidation.trim() ? input.invalidation.trim() : null;
  await upsertThesis(userId, { code: resolved.code, name: resolved.name, reason, invalidation });
  return { ok: true, message: `✅ ${resolved.name} 보유 이유 기록했어. 나중에 "보유 이유 아직 유효해?" 하고 물어보면 이거랑 비교해줄게.` };
}

// module ⑩ — "나는 -20% 손실이면 무조건 재검토해" 같은 사용자 자신의 투자
// 원칙. 쌓지 않고 최신 걸로 교체(User.investmentPrinciples) — 매번 바뀔 수
// 있는 "지금 내 기준"이라 이력 관리는 과하다고 판단.
const SET_PRINCIPLE_TOOL: Anthropic.Tool = {
  name: "set_investment_principle",
  description:
    "사용자가 자기 투자 원칙/기준을 말해줬을 때 호출해(예: '나는 -20% 손실나면 무조건 재검토해', '한 종목에 20% 넘게 안 담아'). " +
    "일회성 질문이 아니라 '앞으로 이렇게 할래/이게 내 원칙이야' 같은 선언일 때만.",
  input_schema: {
    type: "object",
    properties: { principle: { type: "string", description: "사용자의 투자 원칙 — 말한 그대로" } },
    required: ["principle"],
  },
};

async function setPrinciple(userId: string, input: { principle?: unknown }): Promise<RecordThesisResult> {
  const principle = typeof input.principle === "string" ? input.principle.trim() : "";
  if (!principle) return { ok: false, message: "어떤 원칙인지 다시 말해줄래?" };
  await prisma.user.update({ where: { id: userId }, data: { investmentPrinciples: principle } });
  return { ok: true, message: `✅ 기억해둘게: "${principle}"` };
}

// 주식 학습 플래닛(lib/learning-curriculum.ts) — 하루치 분석을 끝내고
// "오늘 ~ 분석했어, 가설은 ~" 식으로 말하면 일지로 기록한다. 일지 자체는
// 숫자 판정이 아니라 사용자의 생각을 보존하는 기록이라, 모델은 사용자가
// 말한 내용을 구조화해서 넘기기만 하면 된다(판단은 안 해).
const RECORD_JOURNAL_TOOL: Anthropic.Tool = {
  name: "record_learning_journal",
  description:
    "사용자가 그날의 투자 공부/분석 내용을 말해주면(예: '오늘 삼성전자 분석했어, 반도체 업황 회복이 근거야') 투자 연구 일지로 기록해. " +
    "전부 다 들을 때까지 기다리지 말고, 사용자가 말해준 항목만 채워서 호출해 — 나머지는 다음에 더 말하면 그때 또 불러서 보완하면 돼.",
  input_schema: {
    type: "object",
    properties: {
      marketRegime: { type: "string", description: "오늘 시장 국면 — 상승/하락/횡보/고변동성 중 사용자가 말한 대로" },
      company: { type: "string", description: "오늘 분석한 기업명" },
      thesis: { type: "string", description: "투자 가설(왜 오를/내릴 거라고 보는지)" },
      bullish: { type: "string", description: "상승 근거 — 여러 개면 줄바꿈으로 구분" },
      bearish: { type: "string", description: "하락 위험 — 여러 개면 줄바꿈으로 구분" },
      invalidation: { type: "string", description: "이 가설이 틀렸다고 볼 조건" },
      learnings: { type: "string", description: "오늘 새로 배운 것" },
    },
    required: [],
  },
};

type RecordJournalResult = { ok: boolean; message: string };

async function recordJournal(
  userId: string,
  input: {
    marketRegime?: unknown;
    company?: unknown;
    thesis?: unknown;
    bullish?: unknown;
    bearish?: unknown;
    invalidation?: unknown;
    learnings?: unknown;
  }
): Promise<RecordJournalResult> {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const company = str(input.company);
  const resolved = company ? await resolveStock(company) : null;

  const filled = {
    marketRegime: str(input.marketRegime),
    company: resolved?.name ?? company,
    companyCode: resolved?.code ?? null,
    thesis: str(input.thesis),
    bullish: str(input.bullish),
    bearish: str(input.bearish),
    invalidation: str(input.invalidation),
    learnings: str(input.learnings),
  };
  if (Object.values(filled).every((v) => v === null)) return { ok: false, message: "뭘 기록할지 하나도 못 들었어 — 오늘 분석한 내용을 말해줄래?" };

  await upsertJournalEntry(userId, filled);
  const stats = await getJournalStats(userId);
  const streakNote = stats.streak >= 2 ? ` 연속 **${stats.streak}일째**야 🔥` : "";
  return {
    ok: true,
    message: `✅ 오늘 일지에 기록했어. 지금까지 총 **${stats.total}일** 기록했어.${streakNote} 나중에 "내 기록 검토해줘"라고 하면 지난 가설이랑 실제 결과를 비교해줄게.`,
  };
}

// 플래닛의 "골구를 선생님으로 쓰는 법" 5개 명령 — 사용자가 복사해서 보낸
// 문구(원문 그대로) 또는 비슷한 말로 요청하면, 해당 역할의 지시문을
// 시스템 프롬프트에 꽂아준다. 도구가 아니라 지시문인 이유: 여기엔 "숫자를
// 코드가 계산"할 게 없고(모델이 설명/질문을 생성하는 역할 자체니까),
// record_learning_journal과 달리 쓰기 동작도 아니다.
const TEACHER_CONCEPT_RE = /초보자\s*기준으로\s*설명|확인\s*문제\s*5개|개념\s*선생님|오늘\s*(학습\s*)?주제.*설명해/;
const TEACHER_CONTRARIAN_RE = /반대편에\s*서서|가설이\s*틀릴\s*조건|반박해\s*줘|반론\s*해줘/;
const TEACHER_DISCLOSURE_RE = /이\s*공시를\s*사실|재무적\s*영향.*경로|공시\s*(해석|분석)해/;
const TEACHER_EXAM_RE = /순서로\s*질문해|분석\s*시험관|기업\s*질문해/;
const TEACHER_REVIEW_RE = /과거\s*투자\s*가설과\s*실제\s*결과를\s*비교|반복\s*오류를\s*찾아|내\s*기록\s*검토해|기록\s*검토해\s*줘/;

async function buildTeacherModeBlock(userId: string | null, text: string): Promise<string> {
  if (TEACHER_CONCEPT_RE.test(text)) {
    const topic = userId ? await currentTopicLabel(userId) : null;
    return (
      "\n\n[선생님 모드 — 개념 설명]\n" +
      (topic ? `오늘의 학습 주제: ${topic}\n` : "") +
      "정의, 작동 원리, 실제 사례, 자주 하는 오해, 마지막에 확인 문제 5개(바로 답하지 말고 문제만) 순서로 설명해. 초보자 기준으로, 전문 용어는 풀어서."
    );
  }
  if (TEACHER_CONTRARIAN_RE.test(text)) {
    return (
      "\n\n[선생님 모드 — 반대편 분석가]\n" +
      "사용자의 투자 가설(바로 위 대화나 [내 투자 원칙]/일지에 있으면 그걸로) 반대편에 서서 분석해. 사용자가 놓쳤을 위험, 반대 증거, 이 가설이 틀렸다고 볼 조건을 근거와 함께 제시해 — 무조건 반대하지 말고, 반대 논리가 약하면 약하다고도 말해."
    );
  }
  if (TEACHER_DISCLOSURE_RE.test(text)) {
    return (
      "\n\n[선생님 모드 — 공시 해설가]\n" +
      "사용자가 붙여넣은 공시(또는 방금 말한 내용)를 사실, 재무적 영향, 주가에 영향을 줄 수 있는 경로, 이미 알려진 정보인지, 추가로 확인해야 할 사항 — 이 다섯 항목으로 나눠서 분석해. 원문에 없는 수치는 절대 추정하지 말고 '원문에 없음'이라고 해."
    );
  }
  if (TEACHER_EXAM_RE.test(text)) {
    return (
      "\n\n[선생님 모드 — 기업 분석 시험관]\n" +
      "사용자가 지정한 기업(또는 [지금 대화에서 새로 조회한 종목 데이터]의 기업)을 사업 구조 → 매출 성장 → 수익성 → 현금흐름 → 재무위험 → 경쟁력 → 밸류에이션 순서로 한 번에 하나씩 질문해. 기업을 특정 못했으면 먼저 어떤 기업인지 물어봐. 사용자가 답하면 근거가 부족한 부분을 짚어줘."
    );
  }
  if (TEACHER_REVIEW_RE.test(text) && userId) {
    return await buildJournalReviewBlock(userId);
  }
  return "";
}

async function currentTopicLabel(userId: string): Promise<string | null> {
  const progress = await getProgress(userId);
  if (!progress) return null;
  const lastSentDay = Math.max(1, progress.currentDay - 1);
  const { month, topic } = dailyTopicFor(lastSentDay);
  return `${month.title} — ${topic}`;
}

// "내 기록 검토해줘" — 지난 일지 속 가설을 실제 주가 움직임과 대조해야
// "우연히 맞은 판단"과 "근거가 유효했던 판단"을 구분할 수 있다(플래닛
// 원문 요구사항 그대로). 숫자(그 종목이 실제로 얼마나 움직였는지)는 코드가
// KIS 차트로 직접 계산해 넣고, 판단(우연인지 실력인지)만 LLM에 맡긴다.
async function buildJournalReviewBlock(userId: string): Promise<string> {
  const entries = await getRecentJournalEntries(userId, 8);
  if (entries.length === 0) {
    return "\n\n[선생님 모드 — 투자 기록 검토관]\n아직 저장된 일지가 없어 — 아직 비교할 기록이 없다고 사용자에게 알려줘.";
  }

  const withMoves = await Promise.all(
    entries.map(async (e) => {
      if (!e.companyCode) return { e, movePct: null as number | null };
      const candles = await fetchKisChart(e.companyCode, "D", 60).catch(() => []);
      const fromIdx = candles.findIndex((c) => c.date >= e.date);
      if (fromIdx === -1 || candles.length === 0) return { e, movePct: null };
      const base = candles[fromIdx].close;
      const latest = candles[candles.length - 1].close;
      const movePct = base > 0 ? ((latest - base) / base) * 100 : null;
      return { e, movePct };
    })
  );

  const lines = [
    "[선생님 모드 — 투자 기록 검토관 · 아래 '실제 움직임'은 코드가 KIS 차트로 직접 계산한 값, 그대로 근거로 써]",
  ];
  for (const { e, movePct } of withMoves) {
    const moveLabel = movePct === null ? "실제 움직임 조회 불가" : `실제 움직임 ${movePct >= 0 ? "+" : ""}${movePct.toFixed(1)}%(기록일 종가 대비 현재)`;
    lines.push(
      `- ${e.date}(${e.day}일차) ${e.company ?? "기업 미기재"}: 가설="${e.thesis ?? "-"}" / 상승근거="${e.bullish ?? "-"}" / 하락위험="${e.bearish ?? "-"}" / 무효조건="${e.invalidation ?? "-"}" → ${moveLabel}`
    );
  }
  lines.push("이걸로 우연히 맞은 판단과 근거가 유효했던 판단을 구분해주고, 반복되는 오류 패턴이 있으면 짚어줘.");
  return "\n\n" + lines.join("\n");
}

// "PER이 뭐야?", "이자보상배율 무슨 뜻이야?" 같은 모르는 용어 질문 — 모델이
// 혼자 추측해서 설명하는 대신 실제 네이버 지식백과 검색 결과를 먼저 찾아서
// 근거로 준다(사용자 요청: "모르는 단어 물어보면 네이버에 검색해서 알려줘").
// 정규식으로 "용어 + 뭐야/무슨 뜻" 패턴을 찾아 그 용어만 떼어낸다 — 완벽하진
// 않지만(예: "그게 뭐야"처럼 지시대명사면 빈 검색이 되어 결과 없음으로
// 자연히 빠진다) 이 파일의 다른 블록들과 같은 방식의 휴리스틱이다.
const TERM_LOOKUP_RE = /^(.{1,20}?)\s*(?:이|가|는|은)?\s*(뭐야|무슨\s*뜻|뜻이\s*뭐|뭔\s*뜻|이란\s*뭐야|란\s*뭐야|뭔지\s*알려줘)/;

function extractTermQuery(text: string): string | null {
  const m = text.match(TERM_LOOKUP_RE);
  const term = m?.[1]?.trim();
  return term && term.length > 0 ? term : null;
}

async function buildTermLookupBlock(text: string): Promise<string> {
  const term = extractTermQuery(text);
  if (!term) return "";
  const results = await searchEncyclopedia(term, 2);
  if (results.length === 0) return "";
  const lines = ["\n\n[네이버 지식백과 검색 결과 — 이 용어를 설명할 때 근거로 써, 원문을 그대로 베끼지 말고 쉽게 풀어서 설명해]"];
  for (const r of results) lines.push(`- ${r.title}: ${r.description}`);
  return lines.join("\n");
}

// "학습 시작해줘"/"학습자료 줘"/"학습 그만할래" — 180일 플래닛을 켜고 끄고,
// 자료를 내준다. 자동으로 밀어주는 평일 아침 발송은 없다(2026-10-16 사용자
// 피드백: "자동으로 안보내고 내가 말하면 보내줘") — start와 material 둘 다
// 결국 pullTodayMaterial로 수렴한다(시작하자마자 1일차를 바로 보여주는 게
// 자연스러워서), 자연어 의도 구분용으로 액션만 나눠뒀다.
const LEARNING_CONTROL_TOOL: Anthropic.Tool = {
  name: "set_learning_plan_state",
  description:
    "사용자가 '학습 시작해줘'/'플래닛 시작할래'처럼 180일 주식 학습 플래닛을 시작하고 싶다고 하면 start, '학습자료 줘'/'오늘 미션 줘'처럼 (이미 시작한 상태에서) 자료를 요청하면 material, '학습 그만할래'/'잠깐 쉴래'처럼 멈추고 싶다고 하면 pause를 호출해. 자료는 자동으로 안 오고 이 도구를 불러야만 나간다는 걸 기억해.",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["start", "material", "pause"], description: "start=최초 시작, material=다음 자료 요청, pause=중지" },
    },
    required: ["action"],
  },
};

async function setLearningState(userId: string, input: { action?: unknown }): Promise<RecordJournalResult> {
  if (input.action === "pause") {
    await pauseProgress(userId);
    return { ok: true, message: '⏸ 학습 플래닛 멈췄어. 다시 하고 싶을 때 "학습자료 줘"라고 하면 이어서 줄게.' };
  }
  if (input.action === "start" || input.action === "material") {
    const text = await pullTodayMaterial(userId);
    const prefix = input.action === "start" ? "✅ 주식 학습 플래닛 시작했어!\n\n" : "";
    return { ok: true, message: prefix + text };
  }
  return { ok: false, message: "시작할지, 자료를 받을지, 멈출지 다시 말해줄래?" };
}

// "이번주/이번달/오늘 얼마 썼어" — LLM이 대충 말하지 않게 실제 집계(lib/
// finance-engine.ts)를 코드로 계산해 시스템 프롬프트에 블록으로 넣어준다
// (buildPortfolioBlock과 같은 원칙). record_expense 같은 "쓰기" 도구와 달리
// 이건 조회라 Anthropic 도구 왕복 없이 매 턴 키워드로 감지해 먼저 계산한다.
const EXPENSE_SUMMARY_RE = /이번\s*주.*(얼마|지출)|이번\s*달.*(얼마|지출)|오늘.*(얼마|지출).*(썼|썼어|지출)|얼마\s*썼/;

function detectExpensePeriod(text: string): "today" | "week" | "month" | null {
  if (!EXPENSE_SUMMARY_RE.test(text)) return null;
  if (/이번\s*달/.test(text)) return "month";
  if (/이번\s*주/.test(text)) return "week";
  return "today";
}

async function buildExpenseSummaryBlock(userId: string, text: string): Promise<string> {
  const period = detectExpensePeriod(text);
  if (!period) return "";
  const s = await getExpenseSummary(userId, period);
  const lines = [
    `\n\n[지출 집계 — 아래 숫자를 그대로 근거로 써, 직접 계산하지 마]`,
    `${s.periodLabel}(${s.from}~${s.to}) 총 지출 ₩${s.total.toLocaleString()} (${s.count}건)`,
  ];
  for (const c of s.byCategory) lines.push(`- ${c.category}: ₩${c.amount.toLocaleString()}`);
  return lines.join("\n");
}

// "내 포트폴리오 어때", "리포트 줘" 류 질문에 바로 답할 수 있게 둥지 현황을
// 코드가 집계한 숫자로 시스템 프롬프트에 넣어준다 — 이 앱 전체의 원칙대로
// 숫자는 코드가 계산하고 LLM은 그 숫자를 가지고 설명만 한다.
async function buildPortfolioBlock(userId: string): Promise<string> {
  const [settings, holdings] = await Promise.all([getPortfolioSettings(userId), getHoldingsWithLiveData(userId)]);
  if (holdings.length === 0) {
    return "\n\n[내 둥지 현황]\n아직 등록된 보유 종목이 없어.";
  }
  const overview = computeOverview(settings, holdings);
  const lines = holdings.map((h) => {
    const change = h.changePct !== null ? `${h.changePct >= 0 ? "+" : ""}${h.changePct.toFixed(1)}%` : "-";
    const risk = h.riskStatus ? ` [${h.riskStatus}]` : "";
    return `- ${h.name}(${h.code}): ${h.quantity}주, 매수가 ₩${h.buyPrice.toLocaleString()}, 현재가 ${h.currentPrice !== null ? "₩" + h.currentPrice.toLocaleString() : "-"}, 수익률 ${change}${risk}`;
  });
  return (
    "\n\n[내 둥지 현황 — 실시간 집계, 아래 숫자를 그대로 근거로 써]\n" +
    `총 평가금액 ₩${overview.totalValuation.toLocaleString()}` +
    (overview.profitPct !== null ? `, 전체 수익률 ${overview.profitPct >= 0 ? "+" : ""}${overview.profitPct.toFixed(1)}%` : "") +
    `\n${lines.join("\n")}`
  );
}

function applyAdjustment(
  cards: CardRef[] | undefined,
  toolInput: { code?: unknown; targetPricePct?: unknown; stopLossPricePct?: unknown },
  note: string
): CardUpdate | null {
  const code = typeof toolInput.code === "string" ? toolInput.code : null;
  const ref = code ? cards?.find((c) => c.code === code) : undefined;
  if (!ref) return null;

  const targetPricePct = typeof toolInput.targetPricePct === "number" ? toolInput.targetPricePct : null;
  const stopLossPricePct = typeof toolInput.stopLossPricePct === "number" ? toolInput.stopLossPricePct : null;

  const targetPrice =
    targetPricePct !== null && ref.targetPrice !== null ? ref.targetPrice * (1 + targetPricePct / 100) : ref.targetPrice;
  const stopLossPrice =
    stopLossPricePct !== null && ref.stopLossPrice !== null
      ? ref.stopLossPrice * (1 + stopLossPricePct / 100)
      : ref.stopLossPrice;
  const targetPct = targetPrice !== null && ref.entryPrice ? ((targetPrice - ref.entryPrice) / ref.entryPrice) * 100 : null;

  return { code: ref.code, targetPrice, targetPct, stopLossPrice, note };
}

export type RunChatTurnParams = {
  userId: string | null;
  messages: ChatMessage[]; // 마지막 원소가 이번 턴의 user 메시지
  cards?: CardRef[]; // 웹 전용 — 있으면 adjust_strategy 도구와 카드 컨텍스트를 켠다
};

export type RunChatTurnResult = {
  replyText: string;
  reports?: CandidateDetail[]; // 이번 턴에 새로 조회된 종목 카드
  cardUpdate?: CardUpdate;
  holdingAdded?: { name: string; code: string; quantity: number; buyPrice: number };
  expenseAdded?: boolean;
  error?: string; // 있으면 호출부가 실패로 처리
};

// 웹(app/api/bro/route.ts)과 텔레그램(lib/telegram-chat.ts)이 공유하는 실제
// Claude 호출 + 도구 실행. 호출부는 자기 채널에 맞게 입력을 messages 배열로
// 만들어 넘기고, 응답을 각자의 방식(JSON vs 텔레그램 메시지)으로 전달하기만
// 하면 된다.
export async function runChatTurn(params: RunChatTurnParams): Promise<RunChatTurnResult> {
  const { userId, messages, cards } = params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return { replyText: "", error: "ANTHROPIC_API_KEY가 설정되어 있지 않아요." };
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  // 채팅에 실제 종목명이 나오면(예: "한켐, 비츠로테크, 센서뷰 비교해줘")
  // 그 자리에서 6대 매수 기준을 계산해 카드로 띄운다 — LLM이 판단하는 게
  // 아니라 StockMaster 이름 매칭으로 결정적으로 찾는다(item 방식이 훨씬
  // 안정적). 새로 만든 카드 데이터는 같은 요청의 LLM 답변에도 근거로 준다.
  const mentioned = lastUser ? await findMentionedStocks(lastUser.content) : [];
  const reports = (
    await Promise.all(mentioned.map((m) => buildStockReport(m.name, m.code)))
  ).filter((r): r is CandidateDetail => r !== null);

  // "포트폴리오/둥지/수익률/리포트" 류 질문이 들어왔을 때만 보유 종목 실시간
  // 데이터(KIS 시세·차트 호출 — 비용이 있다)를 같이 불러와 매 채팅마다
  // 불필요하게 외부 API를 때리지 않는다.
  const wantsPortfolioInfo = !!lastUser && /포트폴리오|보유\s*종목|둥지|내\s*자산|수익률|평가\s*금액|리포트|계좌/.test(lastUser.content);
  const portfolioBlock = userId && wantsPortfolioInfo ? await buildPortfolioBlock(userId) : "";
  const expenseSummaryBlock = userId && lastUser ? await buildExpenseSummaryBlock(userId, lastUser.content) : "";

  // module ③/④/⑤/⑦ — 보유종목 진단(lib/holding-assessment-store.ts)이
  // 이미 계산해둔 신호·판정을 그대로 재사용해 깊은 질문에 답한다. 네 질문
  // 유형이 전부 "지금 신호가 뭔지" 공유하니 report는 한 번만 계산하고
  // 블록별로 다르게 써먹는다 — 종목마다 KIS 호출이 들어가 비싸서.
  const DEEP_DIVE_RE = /보유\s*이유|계속\s*들고|들고\s*가도|종목\s*분석|보유\s*검증/;
  const RISK_TOP_RE = /위험한\s*문제|긴급\s*점검|가장\s*위험/;
  const SCENARIO_RE = /시나리오|상승.*하락.*조건|조건.*상승.*하락/;
  const NEWS_IMPACT_RE = /오늘.*(공시|뉴스)|보유종목.*뉴스|뉴스.*영향/;
  const PREDICTION_REVIEW_RE = /예측.*(검증|실패|조건)|지난\s*(주|달).*예측|승률/;
  const ALLOC_RE = /자산배분|목표\s*비중|신규\s*투자금|어디에\s*넣/;

  const needsAssessmentReport =
    !!userId &&
    !!lastUser &&
    (DEEP_DIVE_RE.test(lastUser.content) ||
      RISK_TOP_RE.test(lastUser.content) ||
      SCENARIO_RE.test(lastUser.content) ||
      NEWS_IMPACT_RE.test(lastUser.content));
  const assessmentReport = needsAssessmentReport ? await getAssessmentReport(userId!).catch(() => null) : null;

  let deepDiveBlock = "";
  let riskTopBlock = "";
  let scenarioBlock = "";
  let newsImpactBlock = "";
  if (userId && assessmentReport && lastUser) {
    if (DEEP_DIVE_RE.test(lastUser.content)) deepDiveBlock = await buildHoldingDeepDiveBlock(userId, lastUser.content, assessmentReport);
    if (RISK_TOP_RE.test(lastUser.content)) riskTopBlock = await buildRiskTopBlock(assessmentReport);
    if (SCENARIO_RE.test(lastUser.content)) scenarioBlock = buildScenarioBlock(lastUser.content, assessmentReport);
    if (NEWS_IMPACT_RE.test(lastUser.content)) newsImpactBlock = await buildNewsImpactBlock(assessmentReport);
  }

  // module ⑥ 자산배분 — "신규 투자금 어디에 넣을까"는 wantsPortfolioInfo가
  // 안 걸릴 수도 있는 문구라(예: "자산배분 점검") 따로 다시 불러온다.
  let allocationBlock = "";
  if (userId && ALLOC_RE.test(lastUser?.content ?? "")) {
    const overview = portfolioBlock
      ? null // 이미 wantsPortfolioInfo로 포트폴리오 숫자가 들어갔으면 중복 계산 안 함
      : computeOverview(await getPortfolioSettings(userId), await getHoldingsWithLiveData(userId));
    if (overview) {
      const gaps = overview.allocation
        .map((a) => ({ ...a, diff: a.pct - a.targetPct }))
        .sort((a, b) => a.diff - b.diff); // 가장 많이 모자란(음수) 게 먼저
      const mostUnderweight = gaps[0];
      allocationBlock =
        `\n\n[자산배분 — 목표 대비 현재 비중, 아래 숫자 그대로 써]\n` +
        gaps.map((a) => `- ${a.label}: 현재 ${a.pct.toFixed(1)}% / 목표 ${a.targetPct.toFixed(1)}% (${a.diff >= 0 ? "+" : ""}${a.diff.toFixed(1)}%p)`).join("\n") +
        (mostUnderweight.diff < -1
          ? `\n신규 투자금이 있다면 가장 부족한 "${mostUnderweight.label}"부터 채우는 게 목표 비중에 가까워져.`
          : "\n지금은 목표 비중에서 크게 안 벗어나 있어.");
    }
  }

  // module ⑧ 예측 성능 검증관 — 이미 있는 통계(lib/prediction-learning.ts,
  // 표본 3건 미만 조건은 자동으로 뺀다)를 그대로 재사용. 여기서 새로
  // 계산하지 않는다.
  const predictionReviewBlock =
    lastUser && PREDICTION_REVIEW_RE.test(lastUser.content)
      ? "\n\n[예측 성과 검증 — 이미 집계된 통계, 표본 작은 조건은 이미 제외됨]\n" + (await cumulativeLearningBlock())
      : "";

  // module ⑪ 주식 학습 플래닛 — 선생님 모드 5종(개념설명/반박/공시해설/
  // 시험관/기록검토) 중 하나가 감지되면 해당 지시문을 꽂는다.
  const teacherModeBlock = lastUser ? await buildTeacherModeBlock(userId, lastUser.content) : "";
  // "~가 뭐야" 류 용어 질문엔 네이버 지식백과 검색 결과를 근거로 끼워준다.
  const termLookupBlock = lastUser ? await buildTermLookupBlock(lastUser.content) : "";

  const client = new Anthropic();
  const baseSystem = await buildSystemPrompt();
  const cardsBlock =
    cards && cards.length > 0
      ? "\n\n[지금 화면에 떠 있는 카드]\n" +
        cards.map((c) => `- ${c.name}(${c.code}): 목표가=${c.targetPrice ?? "-"} 손절가=${c.stopLossPrice ?? "-"}`).join("\n")
      : "";
  const principlesBlock = userId
    ? await prisma.user
        .findUnique({ where: { id: userId }, select: { investmentPrinciples: true } })
        .then((u) => (u?.investmentPrinciples ? `\n\n[사용자의 투자 원칙 — 조언할 때 참고해]\n${u.investmentPrinciples}` : ""))
    : "";
  const loginNote = userId
    ? ""
    : "\n\n[참고] 이 사용자는 로그인하지 않았어 — '얼마 샀어'/'~썼어'처럼 기록을 요청하면 기록할 수 없고, 구글로 로그인하면 둥지에 자동으로 기록된다고 안내해줘.";
  // cards는 웹(golgoo-workspace)만 보내는 값이라(카드가 0개여도 빈 배열로는
  // 보냄, 텔레그램은 아예 이 필드를 안 보냄) 그 존재 여부로 채널을 구분할
  // 수 있다 — 종목 데이터 답변을 "카드도 같이 보이니 짧게" 할지 "이 답이
  // 전부니 충분히" 할지(위 [지금 대화에서 새로 조회한 종목 데이터] 관련
  // 지침 참고) 모델이 판단하게 알려준다.
  const channelNote = cards !== undefined ? "" : "\n\n[참고] 지금은 텔레그램 대화야 — 화면에 뜨는 카드가 없어.";
  const system =
    baseSystem +
    cardsBlock +
    (reports.length > 0 ? "\n\n" + stockContextBlock(reports) : "") +
    portfolioBlock +
    expenseSummaryBlock +
    deepDiveBlock +
    riskTopBlock +
    scenarioBlock +
    newsImpactBlock +
    allocationBlock +
    predictionReviewBlock +
    teacherModeBlock +
    termLookupBlock +
    principlesBlock +
    loginNote +
    channelNote;

  const tools: Anthropic.Tool[] = [];
  if (cards) tools.push(ADJUST_TOOL); // 화면 카드 개념이 있는 채널(웹)에서만
  if (userId)
    tools.push(
      RECORD_HOLDING_TOOL,
      RECORD_EXPENSE_TOOL,
      RECORD_INCOME_TOOL,
      RECORD_LIABILITY_TOOL,
      ADD_GOAL_TOOL,
      RECORD_THESIS_TOOL,
      SET_PRINCIPLE_TOOL,
      RECORD_JOURNAL_TOOL,
      LEARNING_CONTROL_TOOL
    );

  const anthropicMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  // Claude API는 메시지 배열이 user 역할로 시작해야 한다 — 골구가 먼저
  // 말을 거는 날(텔레그램 능동 알림/선제 브리핑, saveAssistantBroadcast로
  // 저장됨)은 그날의 첫 행이 assistant가 되는데, 그대로 보내면 400 에러가
  // 난다. 내용은 보존하되(모델이 그 알림을 보고 맥락을 잡게) 앞에 빈
  // user 턴을 하나 꽂아 순서만 맞춘다.
  if (anthropicMessages[0]?.role !== "user") anthropicMessages.unshift({ role: "user", content: "(계속)" });

  let lastErr: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 800,
        system,
        messages: anthropicMessages,
        tools,
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "adjust_strategy"
      );
      const cardUpdate = toolUse
        ? applyAdjustment(cards, toolUse.input as Record<string, unknown>, text || "카드에 반영했어.") ?? undefined
        : undefined;

      // record_* 도구는 실제 DB 쓰기라서, 결과를 모른 채 같은 턴에 생성된
      // 모델의 말보다 실행 결과 메시지를 우선한다(성공/실패는 실행 후에야 안다).
      // 사용자가 "과자 5만원, 음료 2만원"처럼 한 메시지에 여러 건을 보고하면
      // 모델이 같은 이름의 도구를 여러 번 호출할 수 있다 — findTool이
      // .find()로 첫 번째 것만 집던 버그(2026-10-19 사용자 확인: 두 번째
      // 항목이 저장 안 됨) 때문에 findAllTools로 바꿔서 전부 실행하고
      // 메시지도 전부 합친다. 도구 종류가 섞여 부르면(흔치 않지만) 이
      // 순서(매수>지출>수입>부채>목표>…)로 먼저 나온 종류의 결과를 쓴다.
      const findAllTools = (name: string) =>
        response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === name);
      const runAll = <R,>(uses: Anthropic.ToolUseBlock[], fn: (uid: string, input: Record<string, unknown>) => Promise<R>): Promise<R[]> =>
        userId ? Promise.all(uses.map((u) => fn(userId, u.input as Record<string, unknown>))) : Promise.resolve([]);

      const holdingResults = await runAll(findAllTools("record_holding_purchase"), recordHoldingPurchase);
      const expenseResults = await runAll(findAllTools("record_expense"), recordExpense);
      const incomeResults = await runAll(findAllTools("record_income"), recordIncome);
      const liabilityResults = await runAll(findAllTools("record_liability"), recordLiability);
      const goalResults = await runAll(findAllTools("add_financial_goal"), addGoalFromChat);
      const thesisResults = await runAll(findAllTools("record_investment_thesis"), recordThesis);
      const principleResults = await runAll(findAllTools("set_investment_principle"), setPrinciple);
      const journalResults = await runAll(findAllTools("record_learning_journal"), recordJournal);
      const learningControlResults = await runAll(findAllTools("set_learning_plan_state"), setLearningState);

      const joinMsgs = (results: { message: string }[]): string | null => (results.length > 0 ? results.map((r) => r.message).join("\n") : null);

      const replyText =
        joinMsgs(holdingResults) ??
        joinMsgs(expenseResults) ??
        joinMsgs(incomeResults) ??
        joinMsgs(liabilityResults) ??
        joinMsgs(goalResults) ??
        joinMsgs(thesisResults) ??
        joinMsgs(principleResults) ??
        joinMsgs(journalResults) ??
        joinMsgs(learningControlResults) ??
        cardUpdate?.note ??
        // "카드에 반영했어."는 cardUpdate(=웹의 adjust_strategy)에만 맞는
        // 말이라, 그 경우가 아닌데 모델이 텍스트도 도구도 없이 끝내면(드물지만
        // 2026-10-15 텔레그램에서 실제로 발생 — 맥락 없는 질문에 빈 응답)
        // 채널에 안 맞는 문장 대신 정직하게 다시 물어보는 말로 대체한다.
        (text || "미안, 지금 질문을 제대로 못 받았어. 다시 한번 말해줄래?");

      // 웹은 매 요청마다 자기 쪽 history를 통째로 보내니(한 번의 새 user
      // 턴만 추가된 상태) 저장은 그 새 턴 하나만 — 아래 lastUser.content가
      // 그 턴이다. 텔레그램도 같은 함수를 타므로 여기 한 곳에만 저장하면
      // 두 채널이 같은 "오늘의 대화"에 자연히 합쳐진다.
      if (lastUser) await saveChatTurn(userId, todayISO(), lastUser.content, replyText);

      const firstHolding = holdingResults.find((r) => r.ok);
      return {
        replyText,
        reports: reports.length > 0 ? reports : undefined,
        cardUpdate,
        holdingAdded: firstHolding
          ? { name: firstHolding.name!, code: firstHolding.code!, quantity: firstHolding.quantity!, buyPrice: firstHolding.buyPrice! }
          : undefined,
        expenseAdded: expenseResults.some((r) => r.ok) ? true : undefined,
      };
    } catch (e) {
      lastErr = e;
      const overloaded = e instanceof Anthropic.APIError && (e.status === 429 || e.status === 529 || e.status === 500);
      if (overloaded && i < 2) {
        await new Promise((r) => setTimeout(r, 900 * (i + 1)));
        continue;
      }
      break;
    }
  }

  const overloaded = lastErr instanceof Anthropic.APIError && (lastErr.status === 429 || lastErr.status === 529);
  return {
    replyText: "",
    error: overloaded ? "지금 서버가 잠깐 몰렸나 봐. 몇 초 뒤에 다시 물어봐 줄래?" : "미안, 지금 응답을 못 가져왔어. 잠깐 뒤에 다시 시도해줘.",
  };
}
