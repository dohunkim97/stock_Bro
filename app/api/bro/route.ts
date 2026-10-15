import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runChatTurn, type ChatMessage, type CardRef } from "@/lib/golgoo-chat";

// 채팅에서 새로 언급된 종목이 있으면 getCandidateDetails가 종목마다 DART
// 공시까지 같이 불러오는데(lib/dart.ts의 BUNDLE_BUDGET_MS, 최대 40초) 그
// 뒤에 이어지는 채팅 LLM 호출 시간까지 더하면 기본 제한(10초)으로는 부족
// 하다 — app/api/bro/field-detail/route.ts와 같은 이유로 60초까지 늘림
// (Vercel Hobby 플랜의 함수 실행시간 상한이 60초).
export const maxDuration = 60;

// 실제 로직(Claude 호출, 도구 실행)은 lib/golgoo-chat.ts에 있다 — 텔레그램
// 대화(lib/telegram-chat.ts)도 같은 함수를 쓴다. 이 라우트는 HTTP 입출력만.
export async function POST(req: NextRequest) {
  const { messages, cards } = (await req.json()) as { messages: ChatMessage[]; cards?: CardRef[] };

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const result = await runChatTurn({ userId, messages, cards });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({
    reply: result.replyText,
    cards: result.reports,
    cardUpdate: result.cardUpdate,
    holdingAdded: result.holdingAdded,
    expenseAdded: result.expenseAdded,
  });
}
