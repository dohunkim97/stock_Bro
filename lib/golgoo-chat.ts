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
import { addExpenseRecord } from "@/lib/finance-engine";
import { EXPENSE_CATEGORIES } from "@/lib/finance-constants";

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
    "아무 숫자도 없으면 호출하지 말고 먼저 얼마에 몇 주 샀는지 되물어봐.",
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
    message: `✅ 둥지에 ${resolved.name} ${roundedQuantity}주, 매수가 ₩${roundedPrice.toLocaleString()} (총 ₩${total.toLocaleString()}) 기록했어.${assumedNote}`,
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
    "'주식 샀어'처럼 종목 매수면 이 도구 대신 record_holding_purchase를 써. amount(금액)는 필수고, 못 들었으면 호출하지 말고 얼마 썼는지 되물어봐.",
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

async function recordExpense(
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

  return { ok: true, message: `✅ 지출 기록했어: ${category} ₩${amount.toLocaleString()}${memo ? ` (${memo})` : ""}` };
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

  const client = new Anthropic();
  const baseSystem = await buildSystemPrompt();
  const cardsBlock =
    cards && cards.length > 0
      ? "\n\n[지금 화면에 떠 있는 카드]\n" +
        cards.map((c) => `- ${c.name}(${c.code}): 목표가=${c.targetPrice ?? "-"} 손절가=${c.stopLossPrice ?? "-"}`).join("\n")
      : "";
  const loginNote = userId
    ? ""
    : "\n\n[참고] 이 사용자는 로그인하지 않았어 — '얼마 샀어'/'~썼어'처럼 기록을 요청하면 기록할 수 없고, 구글로 로그인하면 둥지에 자동으로 기록된다고 안내해줘.";
  const system =
    baseSystem + cardsBlock + (reports.length > 0 ? "\n\n" + stockContextBlock(reports) : "") + portfolioBlock + loginNote;

  const tools: Anthropic.Tool[] = [];
  if (cards) tools.push(ADJUST_TOOL); // 화면 카드 개념이 있는 채널(웹)에서만
  if (userId) tools.push(RECORD_HOLDING_TOOL, RECORD_EXPENSE_TOOL);

  const anthropicMessages = messages.map((m) => ({ role: m.role, content: m.content }));

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
      const recordHoldingUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_holding_purchase"
      );
      const recordExpenseUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_expense"
      );
      const holdingResult =
        recordHoldingUse && userId ? await recordHoldingPurchase(userId, recordHoldingUse.input as Record<string, unknown>) : null;
      const expenseResult =
        recordExpenseUse && userId ? await recordExpense(userId, recordExpenseUse.input as Record<string, unknown>) : null;

      const replyText = holdingResult?.message ?? expenseResult?.message ?? (text || "카드에 반영했어.");

      // 웹은 매 요청마다 자기 쪽 history를 통째로 보내니(한 번의 새 user
      // 턴만 추가된 상태) 저장은 그 새 턴 하나만 — 아래 lastUser.content가
      // 그 턴이다. 텔레그램도 같은 함수를 타므로 여기 한 곳에만 저장하면
      // 두 채널이 같은 "오늘의 대화"에 자연히 합쳐진다.
      if (lastUser) await saveChatTurn(todayISO(), lastUser.content, replyText);

      return {
        replyText,
        reports: reports.length > 0 ? reports : undefined,
        cardUpdate,
        holdingAdded: holdingResult?.ok
          ? { name: holdingResult.name!, code: holdingResult.code!, quantity: holdingResult.quantity!, buyPrice: holdingResult.buyPrice! }
          : undefined,
        expenseAdded: expenseResult?.ok ? true : undefined,
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
