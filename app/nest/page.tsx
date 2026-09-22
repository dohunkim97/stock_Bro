import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getPortfolioSettings, getHoldingsWithLiveData, computeOverview } from "@/lib/portfolio";
import { getPortfolioFeed } from "@/lib/portfolio-feed";
import {
  upsertTodaySnapshot,
  computeNetWorthFrom,
  getNetWorthHistory,
  getFinancialGoals,
  getIncomeRecords,
  getExpenseRecords,
  getLiabilities,
} from "@/lib/finance-engine";
import { SummaryBar } from "@/components/nest/summary-bar";
import { SettingsEditor } from "@/components/nest/settings-editor";
import { AllocationChart } from "@/components/nest/allocation-chart";
import { HoldingsTable } from "@/components/nest/holdings-table";
import { AdvisorCard } from "@/components/nest/advisor-card";
import { FeedPanel } from "@/components/nest/feed-panel";
import { NestLoginGate } from "@/components/nest/login-gate";
import { NetWorthPanel } from "@/components/nest/net-worth-panel";
import { GoalsPanel } from "@/components/nest/goals-panel";
import { CashFlowPanel } from "@/components/nest/cashflow-panel";

export const dynamic = "force-dynamic";

// 둥지(My Page) — 개인 포트폴리오. 레이아웃은 상단 요약 바 + 좌(7):자산
// 배분·보유 종목 관리 / 우(5):AI 어드바이저·실시간 피드, 사용자가 정리해준
// 구성을 그대로 따른다.
//
// 구글 로그인 도입(2026-09-22) 후 이 페이지는 "각자의 자산"이라 로그인
// 없이는 못 들어온다 — 다른 페이지(시황/예상종목 등)는 여전히 로그인 없이
// 다 보이고, 둥지만 이렇게 막는다.
export default async function NestPage() {
  const session = await auth();
  if (!session?.user?.id) return <NestLoginGate />;

  const userId = session.user.id;
  const [settings, holdings, stocks, goals, income, expense, liabilities] = await Promise.all([
    getPortfolioSettings(userId),
    getHoldingsWithLiveData(userId),
    prisma.stockMaster.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true, market: true } }),
    getFinancialGoals(userId),
    getIncomeRecords(userId),
    getExpenseRecords(userId),
    getLiabilities(userId),
  ]);

  const overview = computeOverview(settings, holdings);
  const holdingNames = [...new Set(holdings.map((h) => h.name))];
  const feed = await getPortfolioFeed(holdingNames);

  // 순자산 계산·오늘의 스냅샷 기록 — 이미 위에서 불러온 settings/holdings/
  // liabilities/income/expense를 그대로 재사용한다(lib/finance-engine.ts의
  // computeNetWorthFrom 주석 참고 — 안 그러면 실시간 시세를 두 번 부름).
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const since30ISO = since30.toISOString().slice(0, 10);
  const monthlyIncome = income.filter((r) => r.date >= since30ISO).reduce((s, r) => s + r.amount, 0);
  const monthlyExpense = expense.filter((r) => r.date >= since30ISO).reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.principal, 0);
  const netWorthNow = computeNetWorthFrom(settings, holdings, totalLiabilities, monthlyIncome, monthlyExpense);
  await upsertTodaySnapshot(userId, netWorthNow);
  const netWorthHistory = await getNetWorthHistory(userId, 90);

  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "26px 24px 60px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <SummaryBar overview={overview} />
        </div>
        <div style={{ marginTop: 4 }}>
          <SettingsEditor settings={settings} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <AllocationChart overview={overview} />
          <HoldingsTable initialHoldings={holdings} stocks={stocks} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <AdvisorCard />
          <FeedPanel items={feed} holdingNames={holdingNames} />
        </div>
      </div>

      {/* 둥지 리뉴얼 Phase 1(재무관리) — 순자산 추이 + 목표 관리 +
          수입/지출/부채. 기존 위 두 섹션(자산배분/보유종목, 어드바이저/
          피드)은 그대로 두고 그 아래에 새 줄로 이어붙인다. */}
      <div style={{ marginTop: 20 }}>
        <NetWorthPanel current={netWorthNow} history={netWorthHistory} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: 20, alignItems: "start", marginTop: 20 }}>
        <CashFlowPanel income={income} expense={expense} liabilities={liabilities} />
        <GoalsPanel goals={goals} netWorth={netWorthNow.netWorth} />
      </div>
    </main>
  );
}
