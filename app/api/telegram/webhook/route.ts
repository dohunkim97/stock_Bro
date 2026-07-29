import { NextRequest, NextResponse } from "next/server";
import { saveTelegramMessage, type TelegramUpdate } from "@/lib/telegram-news";

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

  // Setup/discovery mode: until TELEGRAM_ALLOWED_CHAT_ID is configured, log
  // the sender's chat id (visible in Vercel function logs) instead of
  // storing anything, so it can be read once and set as the allowlist.
  const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!allowedChatId) {
    if (chatId) console.log("[telegram-webhook] chat id (not yet allowlisted):", chatId);
    return NextResponse.json({ ok: true });
  }

  if (chatId !== allowedChatId) {
    // Silently ignore messages from anyone else — no error response that
    // would confirm this bot is listening for a specific chat.
    return NextResponse.json({ ok: true });
  }

  if (update) await saveTelegramMessage(update);
  return NextResponse.json({ ok: true });
}
