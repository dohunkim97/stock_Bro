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
