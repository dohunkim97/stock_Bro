import { NextRequest, NextResponse } from "next/server";
import { saveTelegramMessage, extractLink, type TelegramUpdate } from "@/lib/telegram-news";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { prisma } from "@/lib/prisma";

// 같은 방에서 기사 링크가 오면 제보로 저장하고, 링크 없는 메시지("안녕" 같은
// 일반 대화)면 그 방의 chat id를 알려준다 — 이미 이 chat id로 계정을 연결한
// 뒤에는 매번 반복하지 않게 조용히 넘어간다.
async function replyWithChatIdIfUnlinked(chatId: string) {
  const linked = await prisma.user.findUnique({ where: { telegramChatId: chatId }, select: { id: true } }).catch(() => null);
  if (linked) return;
  await sendTelegramMessage(
    chatId,
    `이 chat id를 둥지 설정 > 텔레그램 알림에 넣어줘:\n${chatId}\n\n연결하면 보유 종목 판정이 나빠질 때 내가 먼저 메시지 보낼게.`
  );
}

// Telegram calls this on every message sent to the bot. Registered via
// setWebhook with a secret_token, which Telegram echoes back on every
// request as this header — the only way to tell Telegram's calls apart
// from anyone else who finds this URL.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;
  const chatId = message ? String(message.chat.id) : undefined;
  const text = (message?.text ?? message?.caption ?? "").trim();
  const hasLink = !!extractLink(text);

  // Comma-separated so more than one person (e.g. a collaborator's own
  // private chat with the bot, or a shared group chat) can feed the same
  // pipeline — set once as a single id, still works unchanged.
  const allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_ID?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!allowedChatIds || allowedChatIds.length === 0) {
    // Setup/discovery mode: until TELEGRAM_ALLOWED_CHAT_ID is configured at
    // all, log the sender's chat id (visible in Vercel function logs)
    // instead of storing anything, so it can be read once and set as the
    // allowlist.
    if (chatId) console.log("[telegram-webhook] chat id (not yet allowlisted):", chatId);
    return NextResponse.json({ ok: true });
  }

  const isAllowlisted = !!chatId && allowedChatIds.includes(chatId);

  // 제보 채널이든(허용된 chat) 아니든, 기사 링크가 있는 메시지만 제보로 저장한다.
  if (isAllowlisted && hasLink && update) {
    await saveTelegramMessage(update);
    return NextResponse.json({ ok: true });
  }

  // 링크가 없으면(제보 채널에서의 잡담이든, 다른 chat이든) 같은 방식으로
  // "대화"로 취급 — 지금은 chat id 안내뿐이지만 나중에 실제 대화로 넓힐 수 있다.
  if (chatId) {
    if (!isAllowlisted) console.log("[telegram-webhook] message from non-allowlisted chat id:", chatId);
    await replyWithChatIdIfUnlinked(chatId);
  }
  return NextResponse.json({ ok: true });
}
