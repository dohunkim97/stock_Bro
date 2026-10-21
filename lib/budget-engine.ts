// "자동 예산 감시 엔진" — 사용자 요청(2026-10-21) 3번. 지출이 기록되면
// 카테고리별 예산 대비 사용률을 코드가 계산하고, 80%/100% 선을 이번 달에
// 처음 넘을 때만 LLM 없이 미리 정한 문구로 텔레그램 경고를 보낸다(쿨다운/
// 중복방지는 BudgetAlertLog — lib/portfolio-alerts.ts의 PortfolioAlertLog와
// 같은 패턴: userId+카테고리+단계+월 조합에 유니크 제약). "목표 저축액
// 충족 가능 여부"는 이미 있는 FinancialGoal.monthlyContribution과 비교한다
// — 새 "저축 목표" 개념을 따로 안 만들고 기존 목표 기능을 재사용한다.

import { prisma } from "@/lib/prisma";
import { todayISO } from "@/lib/dates";
import { getExpenseSummary } from "@/lib/finance-engine";
import { sendTelegramMessage } from "@/lib/telegram-send";

export type CategoryBudgetData = { category: string; monthlyLimit: number };

export async function setCategoryBudget(userId: string, category: string, monthlyLimit: number) {
  return prisma.categoryBudget.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, monthlyLimit },
    update: { monthlyLimit },
  });
}

export async function removeCategoryBudget(userId: string, category: string) {
  return prisma.categoryBudget.deleteMany({ where: { userId, category } }).catch(() => null);
}

export function getCategoryBudgets(userId: string): Promise<CategoryBudgetData[]> {
  return prisma.categoryBudget.findMany({ where: { userId }, orderBy: { category: "asc" }, select: { category: true, monthlyLimit: true } });
}

function daysInMonth(dateISO: string): number {
  const [y, m] = dateISO.split("-").map(Number);
  return new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
}

function dayOfMonth(dateISO: string): number {
  return Number(dateISO.slice(8, 10));
}

export type CategoryBudgetStatus = {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  pctUsed: number;
  projectedMonthSpend: number; // 지금까지의 일평균 지출로 이번 달 말까지 단순 외삽
  willExceed: boolean;
};

// 예산이 설정된 카테고리만 — 설정 안 한 카테고리는 "감시 대상이 아님"이라
// 상태를 만들 이유가 없다(한도가 없는데 "초과"를 말할 수 없으니까).
export async function computeBudgetStatus(userId: string): Promise<CategoryBudgetStatus[]> {
  const [budgets, summary] = await Promise.all([getCategoryBudgets(userId), getExpenseSummary(userId, "month")]);
  if (budgets.length === 0) return [];

  const today = todayISO();
  const elapsed = Math.max(1, dayOfMonth(today));
  const total = daysInMonth(today);
  const spentByCategory = new Map(summary.byCategory.map((c) => [c.category, c.amount]));

  return budgets.map((b) => {
    const spent = spentByCategory.get(b.category) ?? 0;
    const projectedMonthSpend = (spent / elapsed) * total;
    return {
      category: b.category,
      limit: b.monthlyLimit,
      spent,
      remaining: b.monthlyLimit - spent,
      pctUsed: b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0,
      projectedMonthSpend,
      willExceed: projectedMonthSpend > b.monthlyLimit,
    };
  });
}

export type MonthOverview = {
  income: number;
  expense: number;
  projectedExpense: number;
  projectedSavings: number; // 이번 달 수입 - 예상 지출(단순화: 수입은 지금까지 들어온 만큼 유지된다고 가정)
  requiredMonthlyContribution: number; // 등록된 목표들의 월 투자금 합
  feasible: boolean | null; // 등록된 목표가 없으면 null(판단할 게 없음)
};

// "이번 달 저축 가능해?", "목표 달성 가능해?" 질문에 코드가 계산한 숫자로
// 답하기 위한 월 개요 — FinancialGoal.monthlyContribution(목표 화면에서
// 이미 쓰는 "현재 월 투자금")과 예상 저축액을 비교한다.
export async function computeMonthOverview(userId: string): Promise<MonthOverview> {
  const today = todayISO();
  const from = `${today.slice(0, 7)}-01`;
  const [incomeRows, expenseSummary, goals] = await Promise.all([
    prisma.incomeRecord.findMany({ where: { userId, date: { gte: from, lte: today } }, select: { amount: true } }),
    getExpenseSummary(userId, "month"),
    prisma.financialGoal.findMany({ where: { userId }, select: { monthlyContribution: true } }),
  ]);
  const income = incomeRows.reduce((s, r) => s + r.amount, 0);
  const elapsed = Math.max(1, dayOfMonth(today));
  const total = daysInMonth(today);
  const projectedExpense = (expenseSummary.total / elapsed) * total;
  const requiredMonthlyContribution = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const projectedSavings = income - projectedExpense;
  return {
    income,
    expense: expenseSummary.total,
    projectedExpense,
    projectedSavings,
    requiredMonthlyContribution,
    feasible: goals.length > 0 ? projectedSavings >= requiredMonthlyContribution : null,
  };
}

// 두 단계만 — 더 세분화하면(50%/70%/90%...) 메시지 스팸만 커진다. 100%를
// 이미 넘었으면 80% 알림은 생략(먼저 확인해도 이미 늦었으니 바로 초과
// 알림이 더 쓸모 있다).
const ALERT_LEVELS = [100, 80] as const;

async function alreadyAlerted(userId: string, category: string, level: number, month: string): Promise<boolean> {
  const row = await prisma.budgetAlertLog.findUnique({ where: { userId_category_level_month: { userId, category, level, month } } });
  return !!row;
}

async function markAlerted(userId: string, category: string, level: number, month: string): Promise<void> {
  await prisma.budgetAlertLog
    .upsert({ where: { userId_category_level_month: { userId, category, level, month } }, create: { userId, category, level, month }, update: {} })
    .catch(() => {});
}

// 지출 기록 직후(lib/golgoo-chat.ts의 recordExpense) 호출 — 그 카테고리에
// 예산이 없으면 아무 일도 안 한다. 텔레그램이 연결 안 된 사용자(웹에서만
// 쓰는 사람)에게는 보낼 곳이 없으니 역시 조용히 끝낸다.
export async function checkBudgetAndAlert(userId: string, category: string): Promise<void> {
  try {
    const budget = await prisma.categoryBudget.findUnique({ where: { userId_category: { userId, category } } });
    if (!budget || budget.monthlyLimit <= 0) return;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } });
    if (!user?.telegramChatId) return;

    const summary = await getExpenseSummary(userId, "month");
    const spent = summary.byCategory.find((c) => c.category === category)?.amount ?? 0;
    const pct = (spent / budget.monthlyLimit) * 100;
    const month = todayISO().slice(0, 7);

    for (const level of ALERT_LEVELS) {
      if (pct < level) continue;
      if (await alreadyAlerted(userId, category, level, month)) return; // 이번 달 이 단계는 이미 보냄 — 더 낮은 단계도 당연히 보냈을 테니 끝
      const text =
        level >= 100
          ? `🚨 **${category}** 예산을 초과했어 — 이번 달 **₩${Math.round(spent).toLocaleString()}** 썼어(한도 ₩${budget.monthlyLimit.toLocaleString()}).`
          : `⚠️ **${category}** 예산의 **${Math.round(pct)}%**를 썼어(₩${Math.round(spent).toLocaleString()} / ₩${budget.monthlyLimit.toLocaleString()}). 남은 한도 ₩${Math.round(Math.max(0, budget.monthlyLimit - spent)).toLocaleString()}.`;
      await sendTelegramMessage(user.telegramChatId, text);
      await markAlerted(userId, category, level, month);
      return;
    }
  } catch (e) {
    console.error("[budget-engine] checkBudgetAndAlert failed:", e);
  }
}
