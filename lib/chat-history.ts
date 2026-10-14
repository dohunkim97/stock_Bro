import { prisma } from "@/lib/prisma";

export type ChatHistoryDay = {
  date: string;
  messages: { id: string; role: string; text: string; createdAt: Date }[];
};

// One entry per calendar day that had at least one Golgoo exchange, most
// recent first, each carrying its full message list — grouped by date the
// same way MarketBriefing/WeeklyPrediction's own archives already group by
// day/week, not by an explicit "session" concept.
export async function getRecentChatDays(limit = 14): Promise<ChatHistoryDay[]> {
  const groups = await prisma.chatMessage.groupBy({
    by: ["date"],
    orderBy: { date: "desc" },
    take: limit,
  });
  const dates = groups.map((g) => g.date);
  if (dates.length === 0) return [];

  const rows = await prisma.chatMessage.findMany({
    where: { date: { in: dates } },
    orderBy: { createdAt: "asc" },
  });

  const byDate = new Map<string, ChatHistoryDay["messages"]>();
  for (const r of rows) {
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }

  return dates
    .map((date) => ({ date, messages: byDate.get(date) ?? [] }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// 오늘 하루치 대화를 Claude에 넘길 메시지 배열 형태로 — 골구 채팅은 웹(그
// 탭이 들고 있는 React state)과 텔레그램(요청마다 독립적인 웹훅 호출, 자체
// 기억이 없음) 양쪽에서 들어오는데, 둘 다 같은 날짜로 saveChatTurn에 쌓이므로
// 이걸 그대로 "오늘의 대화"로 이어 쓰면 채널을 넘나들어도 같은 하루 맥락을
// 유지한다(예: 웹에서 물어본 걸 텔레그램에서 이어 물어봐도 그날 안에선 기억함).
// limit은 토큰 예산 때문에 최근 N개로 자른다.
export async function getTodayMessagesForChat(
  date: string,
  limit = 20
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await prisma.chatMessage.findMany({ where: { date }, orderBy: { createdAt: "asc" } });
  return rows.slice(-limit).map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.text }));
}

// Best-effort — a DB hiccup here should never break the actual chat reply
// the user is waiting on, so failures are swallowed rather than thrown.
export async function saveChatTurn(date: string, userText: string, assistantText: string): Promise<void> {
  try {
    await prisma.chatMessage.createMany({
      data: [
        { date, role: "user", text: userText },
        { date, role: "assistant", text: assistantText },
      ],
    });
  } catch {
    // swallow
  }
}
