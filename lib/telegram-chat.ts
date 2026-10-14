// 텔레그램 방에서 온, 링크 없는(=제보가 아닌) 메시지를 처리한다 — "모닝
// 리포트 줘"는 LLM 없이 이미 저장된 브리핑을 그대로 relay하고(숫자/요약은
// 크론이 이미 만들어뒀으니 다시 요약시킬 필요가 없다), 그 외엔 골구 채팅
// 엔진(lib/golgoo-chat.ts)에 태워 웹 채팅과 똑같이 답한다 — 종목 질문,
// "얼마 샀어"/"~썼어" 기록, "포트폴리오 어때" 전부 이 한 경로로 들어간다.

import { todayISO, prevBusinessDay } from "@/lib/dates";
import { getTodayMessagesForChat } from "@/lib/chat-history";
import { runChatTurn } from "@/lib/golgoo-chat";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { getBriefingSlotsForDate, parseSectorNote, parseCandidates, SLOT_TITLE, type BriefingSlot } from "@/lib/market-briefing";

// 일부러 "리포트 줘"만 단독으론 안 받는다 — "내 포트폴리오 리포트 줘"처럼
// 개인 자산 쪽을 묻는 말까지 여기로 끌어오면 안 되니(그건 golgoo-chat의
// wantsPortfolioInfo가 따로 처리), 시황/브리핑/모닝 같은 "시장 전체" 신호가
// 같이 있을 때만 시장 브리핑으로 받는다.
const REPORT_RE = /모닝\s*리포트|오늘\s*(브리핑|시황)|브리핑\s*줘|시황\s*(줘|리포트|어때)|장\s*마감\s*리포트/;

const strip = (s: string) => s.replace(/\*\*/g, "");

async function formatBriefing(date: string): Promise<{ text: string; isToday: boolean } | null> {
  let slots = await getBriefingSlotsForDate(date);
  let isToday = true;
  if (slots.length === 0) {
    slots = await getBriefingSlotsForDate(prevBusinessDay(date));
    isToday = false;
  }
  if (slots.length === 0) return null;

  // createdAt asc 정렬이라 마지막이 그날 가장 최근에 나온 슬롯
  const row = slots[slots.length - 1];
  const lines = [`📋 ${SLOT_TITLE[row.slot as BriefingSlot] ?? row.slot} (${row.date})`, "", strip(row.summary)];
  const sector = parseSectorNote(row.sectorNote);
  if (sector) lines.push("", `🔥 ${sector.theme ? sector.theme + " — " : ""}${strip(sector.note)}`);
  const candidates = parseCandidates(row.candidates);
  if (candidates.length > 0) {
    lines.push("", "관찰 포인트:");
    candidates.forEach((c, i) => lines.push(`${i + 1}. ${c.name ? c.name + ": " : ""}${strip(c.reason)}`));
  }
  return { text: lines.join("\n"), isToday };
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

  const history = await getTodayMessagesForChat(date, 20);
  const result = await runChatTurn({ userId, messages: [...history, { role: "user", content: text }] });
  const reply = result.error ?? result.replyText;
  await sendTelegramMessage(chatId, strip(reply));
}
