// 둥지 리뉴얼 Phase 1 — "재무관리" 엔진. 수입/지출/부채/목표 CRUD와,
// GPT 설계 문서 27번 원칙("코드가 계산, AI는 설명만") 그대로 순자산·목표
// 달성 계산을 순수 함수로 구현한다 — LLM은 이 결과를 나중에 설명만 할 뿐
// 숫자를 다시 만들어내지 않는다(lib/portfolio-advisor.ts와 같은 원칙).
//
// 자산 쪽(현금/채권/대체자산 총액은 PortfolioSettings, 국내외 주식은
// PortfolioHolding)은 이미 lib/portfolio.ts에 있어서 그대로 재사용하고,
// 여기서는 그 위에 수입/지출/부채/목표/순자산 스냅샷만 새로 얹는다.

import { prisma } from "@/lib/prisma";
import { todayISO } from "@/lib/dates";
import { calcInstallment, addMonthsISO } from "@/lib/installment";
import { getPortfolioSettings, getHoldingsWithLiveData, type PortfolioSettingsData, type HoldingWithLiveData } from "@/lib/portfolio";

// 카테고리 목록은 lib/finance-constants.ts(prisma 없음)에 — 클라이언트
// 컴포넌트도 그 파일에서 바로 가져다 쓴다. 여기서도 쓸 일이 있으면
// re-export.
export { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/finance-constants";

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ---------- 수입/지출 CRUD ----------

export type CashFlowRecordInput = { date: string; category: string; amount: number; recurring?: boolean; memo?: string };

export function getIncomeRecords(userId: string, sinceDays = 90) {
  return prisma.incomeRecord.findMany({
    where: { userId, date: { gte: daysAgoISO(sinceDays) } },
    orderBy: { date: "desc" },
  });
}

export function addIncomeRecord(userId: string, input: CashFlowRecordInput) {
  return prisma.incomeRecord.create({ data: { ...input, userId } });
}

export async function removeIncomeRecord(userId: string, id: string) {
  return prisma.incomeRecord.deleteMany({ where: { id, userId } }).catch(() => null);
}

// 오늘까지 실제로 나간 지출만 — 할부는 앞으로 낼 회차도 행으로 미리 만들어 두므로
// (아래 addInstallmentExpense) 미래 날짜 행이 "최근 지출"에 섞이지 않게 상한을 건다.
export function getExpenseRecords(userId: string, sinceDays = 90) {
  return prisma.expenseRecord.findMany({
    where: { userId, date: { gte: daysAgoISO(sinceDays), lte: todayISO() } },
    orderBy: { date: "desc" },
  });
}

// 아직 안 낸 할부 회차(내일 이후) — 화면의 "예정된 할부"용
export function getUpcomingInstallments(userId: string) {
  return prisma.expenseRecord.findMany({
    where: { userId, installmentGroupId: { not: null }, date: { gt: todayISO() } },
    orderBy: { date: "asc" },
  });
}

export function addExpenseRecord(userId: string, input: CashFlowRecordInput) {
  return prisma.expenseRecord.create({ data: { ...input, userId } });
}

// 할부 등록 — 총액·개월수·(연)이율만 받아 회차별 금액과 결제일을 여기서 계산해
// 회차마다 한 행씩 만든다. 1회차 날짜가 startDate이고 이후 매월 같은 날.
export async function addInstallmentExpense(
  userId: string,
  input: { startDate: string; category: string; totalAmount: number; months: number; annualRatePct?: number; memo?: string }
) {
  const plan = calcInstallment(input.totalAmount, input.months, input.annualRatePct ?? 0);
  if (!plan) return null;
  const groupId = crypto.randomUUID();
  await prisma.expenseRecord.createMany({
    data: plan.payments.map((amount, i) => ({
      userId,
      date: addMonthsISO(input.startDate, i),
      category: input.category,
      amount,
      memo: input.memo ?? null,
      installmentGroupId: groupId,
      installmentIndex: i + 1,
      installmentMonths: plan.months,
    })),
  });
  return { groupId, plan };
}

// 할부 행을 지우면 그 할부의 모든 회차를 같이 지운다(한 회차만 남기면 총액이 안 맞아서).
export async function removeExpenseRecord(userId: string, id: string) {
  const row = await prisma.expenseRecord.findFirst({ where: { id, userId }, select: { installmentGroupId: true } }).catch(() => null);
  if (row?.installmentGroupId) {
    return prisma.expenseRecord.deleteMany({ where: { userId, installmentGroupId: row.installmentGroupId } }).catch(() => null);
  }
  return prisma.expenseRecord.deleteMany({ where: { id, userId } }).catch(() => null);
}

async function sumRecentIncome(userId: string, days: number): Promise<number> {
  const rows = await prisma.incomeRecord.findMany({
    where: { userId, date: { gte: daysAgoISO(days) } },
    select: { amount: true },
  });
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

async function sumRecentExpense(userId: string, days: number): Promise<number> {
  const rows = await prisma.expenseRecord.findMany({
    where: { userId, date: { gte: daysAgoISO(days), lte: todayISO() } },
    select: { amount: true },
  });
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

// ---------- 부채 CRUD ----------

export type LiabilityInput = {
  name: string;
  type: string;
  principal: number;
  interestRate: number;
  monthlyPayment?: number;
  maturityDate?: string | null;
};

export function getLiabilities(userId: string) {
  return prisma.liability.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export function addLiability(userId: string, input: LiabilityInput) {
  return prisma.liability.create({ data: { ...input, userId } });
}

export async function removeLiability(userId: string, id: string) {
  return prisma.liability.deleteMany({ where: { id, userId } }).catch(() => null);
}

// ---------- 목표 CRUD ----------

export type FinancialGoalInput = {
  name: string;
  targetAmount: number;
  targetDate: string;
  monthlyContribution: number;
  expectedReturnPct?: number;
};

export function getFinancialGoals(userId: string) {
  return prisma.financialGoal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export function addFinancialGoal(userId: string, input: FinancialGoalInput) {
  return prisma.financialGoal.create({ data: { ...input, userId } });
}

export async function updateFinancialGoal(userId: string, id: string, input: Partial<FinancialGoalInput>) {
  const result = await prisma.financialGoal.updateMany({ where: { id, userId }, data: input });
  return result.count > 0;
}

export async function removeFinancialGoal(userId: string, id: string) {
  return prisma.financialGoal.deleteMany({ where: { id, userId } }).catch(() => null);
}

// ---------- 순자산 계산 ----------

export type NetWorthSnapshot = {
  cash: number;
  stockValuation: number;
  otherAssets: number;
  totalAssets: number;
  totalDebt: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpense: number;
};

// GPT 설계 27번("코드가 순자산 계산") 그대로 — 현금/채권/대체자산은
// PortfolioSettings(사용자가 직접 입력한 총액), 주식은 PortfolioHolding의
// 실시간 평가액(lib/portfolio.ts), 부채는 Liability 원금 합. 월 수입/지출은
// 최근 30일 합으로 근사(고정 월급이 아니어도 대략적인 현금흐름을 보여줌).
// 순수 계산만 하는 쪽(computeNetWorthFrom)과 조회까지 하는 쪽
// (computeNetWorthNow)을 나눴다 — app/nest/page.tsx가 이미 settings/
// holdings를 한 번 불러와 쓰고 있어서, 여기서 또 부르면 실시간 시세
// (fetchKisQuote/fetchKisChart)를 종목마다 두 번씩 때리게 된다.
export function computeNetWorthFrom(
  settings: PortfolioSettingsData,
  holdings: HoldingWithLiveData[],
  totalLiabilities: number,
  monthlyIncome: number,
  monthlyExpense: number
): NetWorthSnapshot {
  const stockValuation = holdings.reduce((sum, h) => sum + (h.valuation ?? h.buyPrice * h.quantity), 0);
  const otherAssets = settings.bondAmount + settings.altAssetAmount;
  const cash = settings.cashAmount;
  const totalAssets = cash + stockValuation + otherAssets;

  return {
    cash,
    stockValuation,
    otherAssets,
    totalAssets,
    totalDebt: totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    monthlyIncome,
    monthlyExpense,
  };
}

export async function computeNetWorthNow(userId: string): Promise<NetWorthSnapshot> {
  const [settings, holdings, liabilities, monthlyIncome, monthlyExpense] = await Promise.all([
    getPortfolioSettings(userId),
    getHoldingsWithLiveData(userId),
    prisma.liability.findMany({ where: { userId }, select: { principal: true } }),
    sumRecentIncome(userId, 30),
    sumRecentExpense(userId, 30),
  ]);
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.principal, 0);
  return computeNetWorthFrom(settings, holdings, totalLiabilities, monthlyIncome, monthlyExpense);
}

// 하루에 한 번(둥지 방문 시 첫 로드에서) 그 시점 순자산을 스냅샷으로
// 남긴다 — upsert라 같은 날 여러 번 방문해도 그날의 마지막 값으로만
// 갱신된다(idempotent, lib/weekly-prediction.ts의 upsert 패턴과 동일).
// precomputed를 주면(app/nest/page.tsx처럼 이미 계산해둔 값이 있으면)
// 그대로 저장만 하고, 없으면 이 함수가 직접 계산까지 한다.
export async function upsertTodaySnapshot(userId: string, precomputed?: NetWorthSnapshot): Promise<NetWorthSnapshot> {
  const date = todayISO();
  const nw = precomputed ?? (await computeNetWorthNow(userId));
  await prisma.financialSnapshot.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...nw },
    update: { ...nw },
  });
  return nw;
}

export function getNetWorthHistory(userId: string, days = 365) {
  return prisma.financialSnapshot.findMany({
    where: { userId, date: { gte: daysAgoISO(days) } },
    orderBy: { date: "asc" },
  });
}

// 목표 달성 계산(월 복리 FV, 역산, 날짜 라벨)은 lib/finance-goal-math.ts로
// 뺐다 — 그 파일은 prisma를 안 써서 목표 화면의 클라이언트 컴포넌트
// (월 투자금 슬라이더)에서도 그대로 import해 쓸 수 있다. 여기서도 같은
// 계산이 필요하면 그 모듈에서 가져다 쓴다(재정의하지 않음).
export { estimateMonthsToGoal, requiredMonthlyContribution, monthsBetween, monthsFromTodayLabel } from "@/lib/finance-goal-math";
