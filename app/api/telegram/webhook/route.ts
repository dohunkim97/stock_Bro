import { NextRequest, NextResponse } from "next/server";
import { saveTelegramMessage, extractLink, type TelegramUpdate } from "@/lib/telegram-news";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { handleTelegramText } from "@/lib/telegram-chat";
import { prisma } from "@/lib/prisma";

// 골구 채팅(lib/golgoo-chat.ts)이 종목 조회 시 DART 공시까지 불러올 수 있어
// (app/api/bro/route.ts와 같은 이유로) 기본 10초로는 빠듯해 60초로 늘린다.
export const maxDuration = 60;

// 링크 없는 메시지가 왔을 때: 이미 계정에 연결된 chat이면 골구 채팅으로,
// 아니면(연결 전) chat id 안내로 — 매번 반복하지 않게 안내는 1회성에 가깝게.
async function handleNonLinkMessage(chatId: string, text: string) {
  const user = await prisma.user.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
  if (user) {
    await handleTelegramText(user.id, chatId, text);
    return;
  }
  await sendTelegramMessage(
    chatId,
    `이 chat id를 둥지 설정 > 텔레그램 알림에 넣어줘:\n${chatId}\n\n연결하면 여기서 바로 대화도 하고(모닝 리포트, 지출·매수 기록, 종목 질문), 보유 종목 판정이 나빠질 때 내가 먼저 메시지도 보낼게.`
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

  // 제보 채널이든 아니든, 기사 링크가 있는 메시지만 제보로 저장한다.
  if (isAllowlisted && hasLink && update) {
    await saveTelegramMessage(update);
    return NextResponse.json({ ok: true });
  }

  // 링크가 없으면(제보 채널에서의 대화든, 다른 chat이든) 골구 채팅으로 — 이
  // 자체가 비동기로 좀 걸릴 수 있어(종목 조회·LLM 호출) await로 기다렸다가
  // 응답한다(Telegram은 webhook 응답을 안 기다려도 되지만, 여기선 같은
  // 함수 실행 안에서 끝내는 게 재시도/중복 처리가 더 단순하다).
  if (chatId) {
    if (!isAllowlisted) console.log("[telegram-webhook] message from non-allowlisted chat id:", chatId);
    if (text) await handleNonLinkMessage(chatId, text);
  }
  return NextResponse.json({ ok: true });
}
