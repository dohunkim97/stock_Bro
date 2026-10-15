import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 둥지 "텔레그램 알림 연결" — chat id를 내 계정에 저장한다. 발견 방법은
// app/api/telegram/webhook/route.ts(봇한테 아무 메시지나 보내면 chat id를
// 답장으로 알려줌)에 있다.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { telegramChatId: true } });
  return NextResponse.json({ telegramChatId: user?.telegramChatId ?? null });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.chatId === "string" ? body.chatId.trim() : "";
  const chatId = raw === "" ? null : raw;
  if (chatId !== null && !/^-?\d{1,20}$/.test(chatId)) {
    return NextResponse.json({ error: "chat id는 숫자만 넣어줘(텔레그램이 답장으로 알려준 그대로)" }, { status: 400 });
  }

  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { telegramChatId: chatId } });
    return NextResponse.json({ ok: true, telegramChatId: chatId });
  } catch {
    // unique 제약 위반 — 이미 다른 계정에 연결된 chat id
    return NextResponse.json({ error: "이 chat id는 이미 다른 계정에 연결돼 있어" }, { status: 409 });
  }
}
