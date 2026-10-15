import { prisma } from "@/lib/prisma";

export type ChatHistoryDay = {
  date: string;
  messages: { id: string; role: string; text: string; createdAt: Date }[];
};

// One entry per calendar day that had at least one Golgoo exchange, most
// recent first, each carrying its full message list — grouped by date the
// same way MarketBriefing/WeeklyPrediction's own archives already group by
// day/week, not by an explicit "session" concept.
//
// userId로 반드시 걸러야 한다 — 로그인한 사용자가 둘 이상이면(2026-10-14,
// 친구 온보딩 계기로 발견) 서로의 대화가 이 테이블에 같이 쌓이는데, 여기서
// 거르지 않으면 내 포트폴리오 숫자가 들어간 답변까지 남의 기록보관소에
// 그대로 보인다. null을 주면(비로그인 턴들) 로그인 없이 쓴 턴만 모은다.
export async function getRecentChatDays(userId: string | null, limit = 14): Promise<ChatHistoryDay[]> {
  const groups = await prisma.chatMessage.groupBy({
    by: ["date"],
    where: { userId },
    orderBy: { date: "desc" },
    take: limit,
  });
  const dates = groups.map((g) => g.date);
  if (dates.length === 0) return [];

  const rows = await prisma.chatMessage.findMany({
    where: { userId, date: { in: dates } },
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
// 기억이 없음) 양쪽에서 들어오는데, 같은 userId로 saveChatTurn에 쌓이므로
// 이걸 그대로 "오늘의 대화"로 이어 쓰면 채널을 넘나들어도 같은 하루 맥락을
// 유지한다(예: 웹에서 물어본 걸 텔레그램에서 이어 물어봐도 그날 안에선 기억함).
// 반드시 userId로 걸러서 다른 사람 대화가 안 섞이게 한다(텔레그램처럼 실제
// 로그인한 사용자가 여럿일 수 있는 채널에서 필수). limit은 토큰 예산 때문에
// 최근 N개로 자른다.
export async function getTodayMessagesForChat(
  userId: string,
  date: string,
  limit = 20
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await prisma.chatMessage.findMany({ where: { userId, date }, orderBy: { createdAt: "asc" } });
  return rows.slice(-limit).map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.text }));
}

// Best-effort — a DB hiccup here should never break the actual chat reply
// the user is waiting on, so failures are swallowed rather than thrown.
export async function saveChatTurn(userId: string | null, date: string, userText: string, assistantText: string): Promise<void> {
  try {
    await prisma.chatMessage.createMany({
      data: [
        { userId, date, role: "user", text: userText },
        { userId, date, role: "assistant", text: assistantText },
      ],
    });
  } catch {
    // swallow
  }
}
