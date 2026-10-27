// 둥지 알림의 인라인 버튼 처리(사용자 스펙 2026-10-27 9번 2단계 알림). 버튼 하나가
// 다른 사람 계좌를 열어볼 수 있으면 안 돼서(스펙 "계정별 데이터 접근 엄격 분리"):
//   1) callback_data는 형식만 확인하고 내용은 믿지 않는다
//   2) 버튼이 눌린 chat id → User(telegramChatId, 둥지 설정에서 로그인한 본인이 연결)
//   3) 기록은 id + 그 User의 userId가 둘 다 맞을 때만 읽는다
// 화면은 저장된 기록(HoldingAlertRecord)으로만 그려서 웹훅이 KIS·DART를 다시 부르지 않는다.

import { prisma } from "@/lib/prisma";
import type { TelegramUpdate } from "@/lib/telegram-news";
import { answerCallbackQuery, editTelegramMessage, sendTelegramMessage } from "@/lib/telegram-send";
import { detailKeyboard, parseAlertCallback, renderSection } from "@/lib/holding-alert-detail";

type CallbackQuery = NonNullable<TelegramUpdate["callback_query"]>;

// 둥지 알림 버튼이 아니면 false(다른 처리로 넘김).
export async function handleHoldingAlertCallback(cb: CallbackQuery): Promise<boolean> {
  const parsed = parseAlertCallback(cb.data);
  if (!parsed) return false;

  const chatId = cb.message ? String(cb.message.chat.id) : null;
  if (!chatId) {
    await answerCallbackQuery(cb.id, "오래된 버튼이라 열 수 없어요");
    return true;
  }

  const user = await prisma.user.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
  const record = user ? await prisma.holdingAlertRecord.findFirst({ where: { id: parsed.id, userId: user.id } }) : null;
  if (!record) {
    await answerCallbackQuery(cb.id, "이 알림의 상세를 볼 수 없어요(연결된 계정의 알림이 아니거나 기록이 없음)");
    return true;
  }

  const text = renderSection(parsed.section, record);
  const opts = { replyMarkup: detailKeyboard(record.id, parsed.section), disablePreview: true };
  const ok =
    parsed.mode === "edit" && cb.message
      ? await editTelegramMessage(chatId, cb.message.message_id, text, opts)
      : await sendTelegramMessage(chatId, text, opts);
  await answerCallbackQuery(cb.id, ok ? undefined : "상세를 보내지 못했어요. 잠시 후 다시 눌러줘");
  return true;
}
