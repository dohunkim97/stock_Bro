import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getPortfolioSettings, getHoldingsWithLiveData, computeOverview } from "@/lib/portfolio";
import { getPortfolioFeed } from "@/lib/portfolio-feed";
import { SummaryBar } from "@/components/nest/summary-bar";
import { SettingsEditor } from "@/components/nest/settings-editor";
import { AllocationChart } from "@/components/nest/allocation-chart";
import { HoldingsTable } from "@/components/nest/holdings-table";
import { AdvisorCard } from "@/components/nest/advisor-card";
import { FeedPanel } from "@/components/nest/feed-panel";
import { NestLoginGate } from "@/components/nest/login-gate";

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

  const [settings, holdings, stocks] = await Promise.all([
    getPortfolioSettings(session.user.id),
    getHoldingsWithLiveData(session.user.id),
    prisma.stockMaster.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true, market: true } }),
  ]);

  const overview = computeOverview(settings, holdings);
  const holdingNames = [...new Set(holdings.map((h) => h.name))];
  const feed = await getPortfolioFeed(holdingNames);

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
    </main>
  );
}
