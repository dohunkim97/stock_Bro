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
    // Not silent — logging (not storing) an unrecognized chat id is what
    // makes onboarding a new contributor a log lookup instead of a guess:
    // have them send the bot anything, find their id in the logs, add it
    // to the comma-separated list. No error response either way, so this
    // never confirms to a stranger that the bot is listening for anyone.
    if (chatId) console.log("[telegram-webhook] message from non-allowlisted chat id:", chatId);
    return NextResponse.json({ ok: true });
  }

  if (update) await saveTelegramMessage(update);
  return NextResponse.json({ ok: true });
}
