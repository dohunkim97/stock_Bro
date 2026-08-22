import { StockTable } from "./stock-table";
import { WatchlistNews } from "./watchlist-news";
import { TelegramNewsPanel } from "./telegram-news";
import { AutoRefresh } from "./auto-refresh";
import { AiBriefing } from "./ai-briefing";
import { SectorLeadersPanel } from "./sector-leaders-panel";
import { MoneyFlowPanel } from "./money-flow-panel";
import { MoneyFlowStocksPanel } from "./money-flow-stocks-panel";
import { ThemeNetFlowPanel } from "./theme-net-flow-panel";
import { ThemeNetFlowStocksPanel } from "./theme-net-flow-stocks-panel";
import { MoneyFlowTakePanel } from "./money-flow-take-panel";
import { aggregateSectors } from "@/lib/sector-aggregation";
import { applyThemes, onlyThemed, filterToCurrentTheme } from "@/lib/theme-lookup";
import { rankSectorPerformance, dedupeByStock } from "@/lib/sector-performance";
import { rankMoneyFlowByDay, rankMoneyFlowStocks, rankThemeNetFlow } from "@/lib/money-flow";
import type { WeekInfo } from "@/lib/week";
import { todayISO } from "@/lib/dates";
import type { DailyEntry, Watchlist, ThemeDailyFlow, ThemeNetFlow } from "@/app/generated/prisma/client";

export async function DayView({
  date,
  briefingSlot,
  volumeEntries,
  gainerEntries,
  loserEntries,
  weekInfo,
  weekEntries,
  moneyFlowDays,
  moneyFlowEntries,
  netFlowEntries,
  watchlist,
}: {
  date: string;
  briefingSlot?: string;
  volumeEntries: DailyEntry[];
  gainerEntries: DailyEntry[];
  loserEntries: DailyEntry[];
  weekInfo: WeekInfo;
  weekEntries: DailyEntry[];
  moneyFlowDays: string[];
  moneyFlowEntries: ThemeDailyFlow[];
  netFlowEntries: ThemeNetFlow[];
  watchlist: Watchlist[];
}) {
  const combined = await applyThemes(
    weekEntries.map((e) => ({
      name: e.name,
      code: e.code,
      sector: e.sector,
      changePct: e.changePct,
    }))
  );
  const agg = aggregateSectors(combined);

  // ThemeDailyFlow already carries the theme (as `theme`, mapped to `sector`
  // for lib/money-flow.ts's shared input shape) and is unique per
  // (date, code) — no same-day dedup needed here, unlike the old
  // ranking-derived path. filterToCurrentTheme still matters: a stock's
  // `theme` on each row is a snapshot from whenever that row synced, so a
  // reclassified stock (e.g. moved from 로봇·휴머노이드 to 반도체) otherwise
  // keeps showing up under its old theme too, with a stale changePct from
  // whenever it was last synced under that label.
  const moneyFlowThemedEntries = await filterToCurrentTheme(
    moneyFlowEntries.map((e) => ({
      date: e.date,
      name: e.name,
      code: e.code as string | null,
      sector: e.theme,
      changePct: e.changePct,
      tradingValue: e.tradingValue as string | null,
      marketCap: e.marketCap,
    }))
  );
  const moneyFlowThemes = rankMoneyFlowByDay(moneyFlowThemedEntries, moneyFlowDays);
  const moneyFlowStockGroups = rankMoneyFlowStocks(moneyFlowThemedEntries, moneyFlowDays, 6, 6);

  const netFlowRank = rankThemeNetFlow(
    netFlowEntries.map((e) => ({
      date: e.date,
      name: e.name,
      code: e.code,
      theme: e.theme,
      foreignNet: e.foreignNet,
      institutionNet: e.institutionNet,
    })),
    5,
    6
  );

  const todayEntries = dedupeByStock(
    [...gainerEntries, ...loserEntries, ...volumeEntries].map((e) => ({
      name: e.name,
      code: e.code,
      sector: e.sector,
      changePct: e.changePct,
    }))
  );
  const sectorLeaders = rankSectorPerformance(todayEntries);
  const themeLeaders = rankSectorPerformance(await onlyThemed(todayEntries));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {date === todayISO() && <AutoRefresh />}

      {/* 왼쪽: TOP종목. 오른쪽: 업종/테마 상위 + 오늘 브리핑 — 오른쪽 전체 높이를 TOP종목과 맞춤 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 20, alignItems: "stretch" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 7, letterSpacing: "-0.01em" }}>
            TOP종목
          </div>
          <StockTable
            tabs={[
              {
                key: "gainer",
                label: "급상승 종목",
                badgeText: "상승 TOP",
                badgeColor: "var(--up)",
                accentVar: "var(--up)",
                entries: gainerEntries,
              },
              {
                key: "loser",
                label: "급락 종목",
                badgeText: "하락 TOP",
                badgeColor: "var(--down)",
                accentVar: "var(--down)",
                entries: loserEntries,
              },
              {
                key: "volume",
                label: "거래량 상위",
                badgeText: "거래 TOP",
                badgeColor: "var(--dim)",
                accentVar: "var(--accent)",
                entries: volumeEntries,
              },
            ]}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "stretch" }}>
            <SectorLeadersPanel compact groups={[{ title: "업종상위", items: sectorLeaders }]} />
            <SectorLeadersPanel compact groups={[{ title: "테마상위", items: themeLeaders }]} />
          </div>
          <AiBriefing date={date} slot={briefingSlot} contributors={agg.contributors} />
        </div>
      </div>

      {/* 자금 흐름 2x2 — [시장 관심 상위 테마|테마별 종목] 위, [순매수·순매도 상위|그 종목] 아래.
          종목 칸(오른쪽)에 더 많은 종목을 보여주기 위해 왼쪽(데이터 표)보다 넓게 배분.
          alignItems: stretch로 각 행 안의 두 칸 높이를 서로 맞춤. */}
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 20, alignItems: "stretch" }}>
        <MoneyFlowPanel days={moneyFlowDays} themes={moneyFlowThemes} />
        <MoneyFlowStocksPanel themes={moneyFlowStockGroups} />
        <ThemeNetFlowPanel days={moneyFlowDays.length} buying={netFlowRank.buying} selling={netFlowRank.selling} />
        <ThemeNetFlowStocksPanel buying={netFlowRank.buying} selling={netFlowRank.selling} />
      </div>

      {/* 위 자금 흐름 데이터를 종합한 AI의 투자 방향 의견 */}
      <MoneyFlowTakePanel />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <WatchlistNews items={watchlist} />
        <TelegramNewsPanel />
      </div>
    </div>
  );
}
