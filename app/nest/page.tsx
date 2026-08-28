import { prisma } from "@/lib/prisma";
import { getPortfolioSettings, getHoldingsWithLiveData, computeOverview } from "@/lib/portfolio";
import { getPortfolioFeed } from "@/lib/portfolio-feed";
import { SummaryBar } from "@/components/nest/summary-bar";
import { SettingsEditor } from "@/components/nest/settings-editor";
import { AllocationChart } from "@/components/nest/allocation-chart";
import { HoldingsTable } from "@/components/nest/holdings-table";
import { AdvisorCard } from "@/components/nest/advisor-card";
import { FeedPanel } from "@/components/nest/feed-panel";

export const dynamic = "force-dynamic";

// 둥지(My Page) — 개인 포트폴리오. 레이아웃은 상단 요약 바 + 좌(7):자산
// 배분·보유 종목 관리 / 우(5):AI 어드바이저·실시간 피드, 사용자가 정리해준
// 구성을 그대로 따른다.
export default async function NestPage() {
  const [settings, holdings, stocks] = await Promise.all([
    getPortfolioSettings(),
    getHoldingsWithLiveData(),
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
