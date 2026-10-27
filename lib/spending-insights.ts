// "반복되는 과소비 패턴 지적", "불필요한 고정 지출 후보 발굴" — 사용자
// 요청(2026-10-21) 5번. 둘 다 LLM 판단이 필요 없는 순수 집계라 코드로
// 계산한다(이 숫자들을 바탕으로 한 "왜 그런지"/"뭘 줄일지" 같은 설명은
// 필요할 때 LLM이 이 결과를 근거로 말하면 된다 — 숫자 자체는 여기서 끝).

import { prisma } from "@/lib/prisma";
import { todayISO, offsetCalendarDays } from "@/lib/dates";

export type SpendingTrendItem = {
  category: string;
  thisMonth: number; // 이번 달 1일 ~ 오늘(day N)까지
  lastMonth: number; // 지난달 1일 ~ 같은 N일까지 — 날짜 수를 맞춰야 공정한 비교
  diffPct: number | null; // lastMonth가 0이면 비교 불가(null)
};

function dayOfMonth(dateISO: string): number {
  return Number(dateISO.slice(8, 10));
}

// 전달 같은 일(day)까지의 날짜 — 예: 오늘이 10/21이면 지난달 1일~21일.
// 지난달에 그 날짜가 없으면(예: 오늘 3/31인데 지난달 2월엔 31일이 없음)
// 지난달 마지막 날로 당긴다.
function sameDayLastMonth(todayIso: string): string {
  const [y, m] = todayIso.split("-").map(Number);
  const day = dayOfMonth(todayIso);
  const prevMonthDate = new Date(y, m - 2, 1); // m은 1-based라 m-2가 지난달(0-based)
  const lastDayOfPrevMonth = new Date(y, m - 1, 0).getDate();
  prevMonthDate.setDate(Math.min(day, lastDayOfPrevMonth));
  return `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-${String(prevMonthDate.getDate()).padStart(2, "0")}`;
}

function startOfMonth(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

// 과소비 패턴 — 이번 달(1일~오늘)과 지난달 같은 기간(1일~같은 일)을
// 카테고리별로 비교한다. 날짜 수를 맞춰야(이번 달 10일 치를 지난달 한
// 달 전체랑 비교하면 항상 적어 보이는 착시가 생긴다) 공정하다. 10% 미만
// 금액 변화나 지난달 지출이 아예 없던 카테고리는 노이즈라 제외한다.
export async function computeSpendingTrend(userId: string, minIncreasePct = 30, minAmount = 10000): Promise<SpendingTrendItem[]> {
  const today = todayISO();
  const thisMonthFrom = startOfMonth(today);
  const lastMonthTo = sameDayLastMonth(today);
  const lastMonthFrom = startOfMonth(lastMonthTo);

  const [thisMonthRows, lastMonthRows] = await Promise.all([
    prisma.expenseRecord.findMany({ where: { userId, date: { gte: thisMonthFrom, lte: today } }, select: { category: true, amount: true } }),
    prisma.expenseRecord.findMany({ where: { userId, date: { gte: lastMonthFrom, lte: lastMonthTo } }, select: { category: true, amount: true } }),
  ]);

  const sumByCategory = (rows: { category: string; amount: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + r.amount);
    return m;
  };
  const thisMap = sumByCategory(thisMonthRows);
  const lastMap = sumByCategory(lastMonthRows);

  const categories = new Set([...thisMap.keys(), ...lastMap.keys()]);
  const items: SpendingTrendItem[] = [];
  for (const category of categories) {
    const thisMonth = thisMap.get(category) ?? 0;
    const lastMonth = lastMap.get(category) ?? 0;
    if (lastMonth === 0 || thisMonth < minAmount) continue; // 비교 기준이 없거나 금액이 작으면 노이즈
    const diffPct = ((thisMonth - lastMonth) / lastMonth) * 100;
    if (diffPct >= minIncreasePct) items.push({ category, thisMonth, lastMonth, diffPct });
  }
  return items.sort((a, b) => (b.diffPct ?? 0) - (a.diffPct ?? 0));
}

export type RecurringCandidate = { category: string; memo: string | null; amount: number; lastDate: string; occurrences: number };

// "불필요한 고정 지출 후보" — recurring=true로 명시 등록된 것 + "구독"
// 카테고리. 최근 60일 안에서, 같은 카테고리+메모 조합이 여러 번(또는
// recurring 표시) 나타난 걸 하나로 묶어 보여준다 — "이거 아직도 쓰고
// 있어?" 되돌아볼 후보 목록이지, "끊어라"라고 단정하는 게 아니다.
export async function getRecurringExpenseCandidates(userId: string): Promise<RecurringCandidate[]> {
  const since = offsetCalendarDays(todayISO(), -60);
  const rows = await prisma.expenseRecord.findMany({
    where: {
      userId,
      date: { gte: since, lte: todayISO() },
      OR: [{ recurring: true }, { category: "구독" }],
    },
    orderBy: { date: "desc" },
    select: { category: true, memo: true, amount: true, date: true },
  });

  const byKey = new Map<string, RecurringCandidate>();
  for (const r of rows) {
    const key = `${r.category}::${r.memo ?? ""}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.occurrences++;
      if (r.date > existing.lastDate) {
        existing.lastDate = r.date;
        existing.amount = r.amount;
      }
    } else {
      byKey.set(key, { category: r.category, memo: r.memo, amount: r.amount, lastDate: r.date, occurrences: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => b.amount - a.amount);
}
