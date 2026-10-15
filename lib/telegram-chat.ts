// 텔레그램 방에서 온, 링크 없는(=제보가 아닌) 메시지를 처리한다 — "모닝
// 리포트 줘"는 LLM 없이 이미 저장된 브리핑을 그대로 relay하고(숫자/요약은
// 크론이 이미 만들어뒀으니 다시 요약시킬 필요가 없다), 그 외엔 골구 채팅
// 엔진(lib/golgoo-chat.ts)에 태워 웹 채팅과 똑같이 답한다 — 종목 질문,
// "얼마 샀어"/"~썼어" 기록, "포트폴리오 어때" 전부 이 한 경로로 들어간다.
// 음성 메모·영수증 사진(lib/telegram-media.ts)도 여기서 글자/지출 기록으로
// 바뀐 뒤 같은 경로를 탄다.

import { todayISO, prevBusinessDay } from "@/lib/dates";
import { getTodayMessagesForChat } from "@/lib/chat-history";
import { runChatTurn, recordExpense } from "@/lib/golgoo-chat";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { downloadTelegramFile, transcribeVoice, extractReceiptFromImage } from "@/lib/telegram-media";
import { getBriefingSlotsForDate, formatBriefingForTelegram } from "@/lib/market-briefing";
import { getProgress } from "@/lib/learning-journal";
import { buildDailyMissionMessage } from "@/lib/learning-push";

// 일부러 "리포트 줘"만 단독으론 안 받는다 — "내 포트폴리오 리포트 줘"처럼
// 개인 자산 쪽을 묻는 말까지 여기로 끌어오면 안 되니(그건 golgoo-chat의
// wantsPortfolioInfo가 따로 처리), 시황/브리핑/모닝 같은 "시장 전체" 신호가
// 같이 있을 때만 시장 브리핑으로 받는다.
const REPORT_RE = /모닝\s*리포트|오늘\s*(브리핑|시황)|브리핑\s*줘|시황\s*(줘|리포트|어때)|장\s*마감\s*리포트/;

// "오늘 미션 다시 보여줘" — 이미 보낸 미션은 그대로 저장돼 있던 값이
// 아니라 결정적으로 다시 만들 수 있는 값이라(lib/learning-curriculum.ts가
// day만 보고 같은 내용을 재현), LLM 왕복 없이 바로 재구성해서 보낸다.
const MISSION_RE = /오늘\s*미션|오늘의\s*미션|미션\s*다시|오늘\s*(학습\s*)?주제\s*(뭐|알려)/;

const strip = (s: string) => s.replace(/\*\*/g, "");

async function formatBriefing(date: string): Promise<{ text: string; isToday: boolean } | null> {
  let slots = await getBriefingSlotsForDate(date);
  let isToday = true;
  if (slots.length === 0) {
    slots = await getBriefingSlotsForDate(prevBusinessDay(date));
    isToday = false;
  }
  if (slots.length === 0) return null;

  // createdAt asc 정렬이라 마지막이 그날 가장 최근에 나온 슬롯. 이제는 크론이
  // 생성되자마자 선제 발송도 하니(app/api/cron/daily-briefing) 이 on-demand
  // relay는 주로 "놓친 브리핑 다시 보기"용이다.
  const row = slots[slots.length - 1];
  return { text: formatBriefingForTelegram(row), isToday };
}

export async function handleTelegramText(userId: string, chatId: string, text: string): Promise<void> {
  const date = todayISO();

  if (REPORT_RE.test(text)) {
    const briefing = await formatBriefing(date);
    if (!briefing) {
      await sendTelegramMessage(chatId, "아직 브리핑이 없어. 조금 있다가 다시 물어봐줄래?");
      return;
    }
    const prefix = briefing.isToday ? "" : "오늘 건 아직이라 최근(전 거래일) 브리핑이야.\n\n";
    await sendTelegramMessage(chatId, prefix + briefing.text);
    return;
  }

  if (MISSION_RE.test(text)) {
    const progress = await getProgress(userId);
    if (!progress) {
      await sendTelegramMessage(chatId, '아직 주식 학습 플래닛을 시작 안 했어 — "학습 시작해줘"라고 말해봐!');
      return;
    }
    if (progress.paused) {
      await sendTelegramMessage(chatId, '지금 학습 플래닛이 멈춰 있어 — "학습 시작해줘"라고 하면 이어서 보낼게.');
      return;
    }
    const day = Math.max(1, progress.currentDay - 1); // 오늘 이미 보낸(또는 보낼) 일차
    const missionText = await buildDailyMissionMessage(day);
    await sendTelegramMessage(chatId, missionText);
    return;
  }

  const history = await getTodayMessagesForChat(userId, date, 20);
  const result = await runChatTurn({ userId, messages: [...history, { role: "user", content: text }] });
  const reply = result.error ?? result.replyText;
  await sendTelegramMessage(chatId, strip(reply));
}

// 보이스 메모 — Whisper로 텍스트화한 뒤 똑같이 handleTelegramText로 넘긴다
// (리포트 요청, 지출/매수 기록, 종목 질문 전부 음성으로도 되게). 전사 자체가
// 안 되면(키 없음/API 실패) 텍스트로 말해달라고 안내만 하고 끝낸다.
export async function handleTelegramVoice(userId: string, chatId: string, fileId: string): Promise<void> {
  const file = await downloadTelegramFile(fileId);
  const text = file ? await transcribeVoice(file.buffer) : null;
  if (!text) {
    await sendTelegramMessage(chatId, "음성을 글자로 못 바꿨어 — 텍스트로 다시 말해줄래?");
    return;
  }
  await handleTelegramText(userId, chatId, text);
}

// 영수증(또는 결제 화면) 사진 — Claude Vision으로 금액/카테고리를 읽어서
// 바로 지출로 기록한다. record_expense 도구와 달리 모델이 이미 숫자를 다
// 추출해줬으니 채팅 왕복 없이 바로 recordExpense를 호출한다.
export async function handleTelegramPhoto(userId: string, chatId: string, fileId: string): Promise<void> {
  const file = await downloadTelegramFile(fileId);
  if (!file) {
    await sendTelegramMessage(chatId, "사진을 못 받았어 — 다시 보내줄래?");
    return;
  }
  const ext = file.filePath.split(".").pop()?.toLowerCase();
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const receipt = await extractReceiptFromImage(file.buffer, mimeType);
  if (!receipt) {
    await sendTelegramMessage(chatId, "영수증에서 금액을 못 읽었어 — 얼마 썼는지 말해줄래?");
    return;
  }
  const result = await recordExpense(userId, receipt);
  await sendTelegramMessage(chatId, result.message);
}
