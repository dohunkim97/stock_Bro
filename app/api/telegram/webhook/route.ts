import { NextRequest, NextResponse } from "next/server";
import { saveTelegramMessage, type TelegramUpdate } from "@/lib/telegram-news";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { prisma } from "@/lib/prisma";

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
  const chatId = update?.message ? String(update.message.chat.id) : undefined;

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

  if (!chatId || !allowedChatIds.includes(chatId)) {
    // 제보(news) 채널이 아닌 채팅 — 둥지 능동적 알림(lib/portfolio-alerts.ts)을
    // 받을 개인 DM일 가능성이 커서, 여기서 chat id를 직접 알려준다(사용자가
    // Vercel 로그를 뒤질 필요 없이 텔레그램 화면에서 바로 복사해 둥지 설정에
    // 붙여넣게). 이미 어떤 계정에 연결된 chat id면 조용히 넘어간다(매번 같은
    // 안내를 반복하지 않게).
    if (chatId) {
      console.log("[telegram-webhook] message from non-allowlisted chat id:", chatId);
      const linked = await prisma.user.findUnique({ where: { telegramChatId: chatId }, select: { id: true } }).catch(() => null);
      if (!linked) {
        await sendTelegramMessage(
          chatId,
          `이 chat id를 둥지 설정 > 텔레그램 알림에 넣어줘:\n${chatId}\n\n연결하면 보유 종목 판정이 나빠질 때 내가 먼저 메시지 보낼게.`
        );
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (update) await saveTelegramMessage(update);
  return NextResponse.json({ ok: true });
}
