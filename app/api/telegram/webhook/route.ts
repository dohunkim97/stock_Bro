import { NextRequest, NextResponse } from "next/server";
import { saveTelegramMessage, extractLink, type TelegramUpdate } from "@/lib/telegram-news";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { handleTelegramText, handleTelegramVoice, handleTelegramPhoto } from "@/lib/telegram-chat";
import { prisma } from "@/lib/prisma";

// 골구 채팅(lib/golgoo-chat.ts)이 종목 조회 시 DART 공시까지 불러올 수 있어
// (app/api/bro/route.ts와 같은 이유로) 기본 10초로는 빠듯해 60초로 늘린다.
export const maxDuration = 60;

// Telegram은 응답이 늦으면(또는 네트워크 문제로) 같은 update를 다시 보낸다 —
// update_id는 이 봇 전체에서 유일/단조증가라, 먼저 처리를 "선점"해서 중복
// 처리(지출/매수가 두 번 기록되는 것 등)를 막는다. create가 실패하면(이미
// 있는 updateId) 이미 처리한 적이 있다는 뜻이라 조용히 끝낸다.
async function claimUpdateOnce(updateId: number | undefined): Promise<boolean> {
  if (updateId === undefined) return true; // update_id가 없는 비정상 페이로드는 막을 수가 없어 그냥 통과
  try {
    await prisma.telegramProcessedUpdate.create({ data: { updateId } });
    return true;
  } catch {
    return false; // 유니크 제약 위반 = 이미 처리됨
  }
}

// 링크 없는 메시지가 왔을 때: 이미 계정에 연결된 chat이면 골구 채팅(텍스트/
// 음성/영수증 사진)으로, 아니면(연결 전) chat id 안내로.
async function handleNonLinkMessage(chatId: string, message: NonNullable<TelegramUpdate["message"]>, text: string) {
  const user = await prisma.user.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
  if (!user) {
    await sendTelegramMessage(
      chatId,
      `이 chat id를 둥지 설정 > 텔레그램 알림에 넣어줘:\n${chatId}\n\n연결하면 여기서 바로 대화도 하고(모닝 리포트, 지출·매수 기록, 종목 질문, 음성·영수증 사진도 돼), 보유 종목 판정이 나빠질 때 내가 먼저 메시지도 보낼게.`
    );
    return;
  }

  if (message.voice) {
    await handleTelegramVoice(user.id, chatId, message.voice.file_id);
    return;
  }
  if (message.photo && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1]; // 작은 것부터 큰 것 순으로 옴
    await handleTelegramPhoto(user.id, chatId, largest.file_id);
    return;
  }
  if (text) {
    await handleTelegramText(user.id, chatId, text);
  }
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
  if (!(await claimUpdateOnce(update?.update_id))) {
    return NextResponse.json({ ok: true }); // 재전송 — 이미 처리함
  }

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
  // 자체가 비동기로 좀 걸릴 수 있어(종목 조회·LLM 호출·음성 전사 등) await로
  // 기다렸다가 응답한다.
  if (chatId && message) {
    if (!isAllowlisted) console.log("[telegram-webhook] message from non-allowlisted chat id:", chatId);
    await handleNonLinkMessage(chatId, message, text);
  }
  return NextResponse.json({ ok: true });
}
