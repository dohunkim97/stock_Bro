import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/bro-context";
import { saveChatTurn } from "@/lib/chat-history";
import { todayISO } from "@/lib/dates";
import { findMentionedStocks, buildStockReport, stockContextBlock } from "@/lib/chat-stock-report";
import type { CandidateDetail } from "@/lib/candidate-detail";

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

  const client = new Anthropic();
  const baseSystem = await buildSystemPrompt();
  const cardsBlock =
    cards && cards.length > 0
      ? "\n\n[지금 화면에 떠 있는 카드]\n" +
        cards.map((c) => `- ${c.name}(${c.code}): 목표가=${c.targetPrice ?? "-"} 손절가=${c.stopLossPrice ?? "-"}`).join("\n")
      : "";
  const system = baseSystem + cardsBlock + (reports.length > 0 ? "\n\n" + stockContextBlock(reports) : "");

  let lastErr: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 800,
        system,
        messages,
        tools: [ADJUST_TOOL],
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

      // The client always sends its full running history with exactly one
      // new user turn appended — save just that turn, not the whole array,
      // so a saved conversation isn't duplicated on every subsequent call.
      // Awaited (not fire-and-forget): a serverless function can be frozen
      // right after the response is sent, which would silently drop an
      // un-awaited write.
      if (lastUser) await saveChatTurn(todayISO(), lastUser.content, text || "(카드 갱신)");

      return NextResponse.json({
        reply: text || "카드에 반영했어.",
        cards: reports.length > 0 ? reports : undefined,
        cardUpdate: cardUpdate ?? undefined,
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
