import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
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

// 채팅에서 새로 언급된 종목이 있으면 getCandidateDetails가 종목마다 DART
// 공시까지 같이 불러오는데(lib/dart.ts의 BUNDLE_BUDGET_MS, 최대 40초) 그
// 뒤에 이어지는 채팅 LLM 호출 시간까지 더하면 기본 제한(10초)으로는 부족
// 하다 — app/api/bro/field-detail/route.ts와 같은 이유로 60초까지 늘림
// (Vercel Hobby 플랜의 함수 실행시간 상한이 60초).
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

// 골구 워크스페이스 좌측 피드에 지금 떠 있는 카드 — adjust_strategy 도구가
// "화면에 있는 카드만" 건드리도록 프론트가 매 요청마다 같이 보내준다.
type CardRef = { code: string; name: string; entryPrice: number | null; targetPrice: number | null; stopLossPrice: number | null };

// 사용자가 "목표가 더 낮춰줘", "손절 타이트하게" 같은 조정을 요청했을 때만
// 골구가 호출하는 도구 — 실제 숫자 계산(비율 적용)은 여기(서버)에서 하고,
// 모델은 "몇 % 조정할지"와 "어느 종목인지"만 판단한다(이 코드베이스의
// 다른 LLM 호출들과 같은 원칙: LLM은 판단, 숫자는 코드가 계산).
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

type CardUpdate = { code: string; targetPrice: number | null; targetPct: number | null; stopLossPrice: number | null; note: string };

// "LG에너지솔루션 100만원 샀어", "삼성전자 10주 85000원에 샀어" 같은 실제
// 매수 보고를 들었을 때만 호출하는 도구 — 둥지(내 보유 종목, lib/portfolio.ts)
// 에 매수 건을 기록한다. 로그인하지 않은 사용자에게는 이 도구 자체를 주지
// 않는다(아래 tools 배열 구성부). 숫자 계산(수량·단가 역산, 종목코드 조회,
// 실제 DB 기록)은 전부 서버가 하고, 모델은 "사용자가 뭘 샀다고 말했는지"
// 추출만 담당한다 — adjust_strategy와 같은 원칙.
const RECORD_HOLDING_TOOL: Anthropic.Tool = {
  name: "record_holding_purchase",
  description:
    "사용자가 실제로 특정 종목을 매수했다고 말했을 때만 호출해(예: 'LG에너지솔루션 100만원 샀어', '삼성전자 10주 85000원에 샀어', '오늘 카카오 20주 샀어'). " +
    "단순히 종목에 대해 묻거나 의견을 구하는 것뿐이면 호출하지 마. quantity(수량)·pricePerShare(주당 매수가)·totalAmount(총 매수금액) 중 최소 하나는 사용자가 말해야 호출할 수 있어 — " +
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

type RecordHoldingResult = {
  ok: boolean;
  message: string;
  name?: string;
  code?: string;
  quantity?: number;
  buyPrice?: number;
};

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

export async function POST(req: NextRequest) {
  const { messages, cards } = (await req.json()) as { messages: ChatMessage[]; cards?: CardRef[] };

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 설정되어 있지 않아요. .env 파일을 확인해 주세요." },
      { status: 500 }
    );
  }

  // 채팅에 실제 종목명이 나오면(예: "한켐, 비츠로테크, 센서뷰 비교해줘")
  // 그 자리에서 6대 매수 기준을 계산해 카드로 띄운다 — LLM이 판단하는 게
  // 아니라 StockMaster 이름 매칭으로 결정적으로 찾는다(item 방식이 훨씬
  // 안정적). 새로 만든 카드 데이터는 같은 요청의 LLM 답변에도 근거로 준다.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const mentioned = lastUser ? await findMentionedStocks(lastUser.content) : [];
  const reports = (
    await Promise.all(mentioned.map((m) => buildStockReport(m.name, m.code)))
  ).filter((r): r is CandidateDetail => r !== null);

  // 로그인한 사용자에게만 둥지(내 보유 종목) 자동 매수 기록 도구를 준다 —
  // 누구인지 모르면 누구 계좌에 기록할지 정할 수 없다. "포트폴리오/둥지/
  // 수익률/리포트" 류 질문이 들어왔을 때만 보유 종목 실시간 데이터(KIS
  // 시세·차트 호출 — 비용이 있다)를 같이 불러와 매 채팅마다 불필요하게
  // 외부 API를 때리지 않는다.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const wantsPortfolioInfo = !!lastUser && /포트폴리오|보유\s*종목|둥지|내\s*자산|수익률|평가\s*금액|리포트|계좌/.test(lastUser.content);
  const portfolioBlock =
    userId && wantsPortfolioInfo ? await buildPortfolioBlock(userId) : "";

  const client = new Anthropic();
  const baseSystem = await buildSystemPrompt();
  const cardsBlock =
    cards && cards.length > 0
      ? "\n\n[지금 화면에 떠 있는 카드]\n" +
        cards.map((c) => `- ${c.name}(${c.code}): 목표가=${c.targetPrice ?? "-"} 손절가=${c.stopLossPrice ?? "-"}`).join("\n")
      : "";
  const loginNote = userId
    ? ""
    : "\n\n[참고] 이 사용자는 로그인하지 않았어 — '얼마 샀어'처럼 매수 기록을 요청하면 기록할 수 없고, 구글로 로그인하면 둥지에 자동으로 기록된다고 안내해줘.";
  const system =
    baseSystem + cardsBlock + (reports.length > 0 ? "\n\n" + stockContextBlock(reports) : "") + portfolioBlock + loginNote;
  const tools: Anthropic.Tool[] = userId ? [ADJUST_TOOL, RECORD_HOLDING_TOOL] : [ADJUST_TOOL];

  let lastErr: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 800,
        system,
        messages,
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
        ? applyAdjustment(cards, toolUse.input as Record<string, unknown>, text || "카드에 반영했어.")
        : null;

      // record_holding_purchase는 실제 DB 쓰기(둥지에 매수 건 기록)라서,
      // 결과를 모른 채 같은 턴에 생성된 모델의 말보다 실행 결과 메시지를
      // 우선한다(성공/실패·정확한 금액은 실행 후에야 알 수 있다).
      const recordToolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_holding_purchase"
      );
      const recordResult =
        recordToolUse && userId
          ? await recordHoldingPurchase(userId, recordToolUse.input as Record<string, unknown>)
          : null;

      const replyText = recordResult ? recordResult.message : text || "카드에 반영했어.";

      // The client always sends its full running history with exactly one
      // new user turn appended — save just that turn, not the whole array,
      // so a saved conversation isn't duplicated on every subsequent call.
      // Awaited (not fire-and-forget): a serverless function can be frozen
      // right after the response is sent, which would silently drop an
      // un-awaited write.
      if (lastUser) await saveChatTurn(todayISO(), lastUser.content, replyText);

      return NextResponse.json({
        reply: replyText,
        cards: reports.length > 0 ? reports : undefined,
        cardUpdate: cardUpdate ?? undefined,
        holdingAdded: recordResult?.ok ? { name: recordResult.name, code: recordResult.code, quantity: recordResult.quantity, buyPrice: recordResult.buyPrice } : undefined,
      });
    } catch (e) {
      lastErr = e;
      const overloaded =
        e instanceof Anthropic.APIError &&
        (e.status === 429 || e.status === 529 || e.status === 500);
      if (overloaded && i < 2) {
        await new Promise((r) => setTimeout(r, 900 * (i + 1)));
        continue;
      }
      break;
    }
  }

  const overloaded =
    lastErr instanceof Anthropic.APIError &&
    (lastErr.status === 429 || lastErr.status === 529);
  return NextResponse.json(
    {
      error: overloaded
        ? "지금 서버가 잠깐 몰렸나 봐. 몇 초 뒤에 다시 물어봐 줄래?"
        : "미안, 지금 응답을 못 가져왔어. 잠깐 뒤에 다시 시도해줘.",
    },
    { status: 502 }
  );
}
