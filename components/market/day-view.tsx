import { StockTable } from "./stock-table";
import { HeightMatchedRow } from "./height-matched-row";
import { WatchlistNews } from "./watchlist-news";
import { TelegramNewsPanel } from "./telegram-news";
import { AutoRefresh } from "./auto-refresh";
import { AiBriefing } from "./ai-briefing";
import { SectorLeadersPanel } from "./sector-leaders-panel";
import { IndexQuotePanel } from "./index-quote-panel";
import { MoneyFlowPanel } from "./money-flow-panel";
import { MoneyFlowStocksPanel } from "./money-flow-stocks-panel";
import { ThemeNetFlowPanel } from "./theme-net-flow-panel";
import { ThemeNetFlowStocksPanel } from "./theme-net-flow-stocks-panel";
import { MoneyFlowTakePanel } from "./money-flow-take-panel";
import { aggregateSectors } from "@/lib/sector-aggregation";
import { applyThemes, onlyThemed, filterToCurrentTheme } from "@/lib/theme-lookup";
import { rankSectorPerformance, dedupeByStock } from "@/lib/sector-performance";
import { rankMoneyFlowByDay, rankMoneyFlowStocks, rankThemeNetFlow } from "@/lib/money-flow";
import { getMarketIndexQuotes } from "@/lib/kis-index-quote";
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
    })),
    (e) => e.sector
  );
  // 1~10위까지 — ThemeNetFlow 쪽(아래)과 동일한 개수로 맞춰서 두 자금흐름
  // 섹션이 서로 비슷한 스케일로 보이도록.
  const moneyFlowThemes = rankMoneyFlowByDay(moneyFlowThemedEntries, moneyFlowDays, 10);
  const moneyFlowStockGroups = rankMoneyFlowStocks(moneyFlowThemedEntries, moneyFlowDays, 10, 6);

  // Same staleness problem as moneyFlowThemedEntries above, for ThemeNetFlow
  // (외국인+기관 순매수) instead of ThemeDailyFlow (거래대금/등락률) — a
  // reclassified stock otherwise still shows up under its old theme's
  // 순매수·순매도 panel with a stale net figure.
  const netFlowThemedEntries = await filterToCurrentTheme(
    netFlowEntries.map((e) => ({
      date: e.date,
      name: e.name,
      code: e.code,
      theme: e.theme,
      foreignNet: e.foreignNet,
      institutionNet: e.institutionNet,
    })),
    (e) => e.theme
  );
  // 5개씩만 보여주면 태양광처럼 순매수 상위권인 테마 말고는 대부분 잘려나가서
  // (실제로 이 window엔 순매수 18개/순매도 27개 테마가 있다) 10개씩으로 늘려
  // 다양성을 확보한다.
  const netFlowRank = rankThemeNetFlow(netFlowThemedEntries, 10, 6);

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
  const indexQuotes = await getMarketIndexQuotes();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {date === todayISO() && <AutoRefresh />}

      {/* 왼쪽: TOP종목. 오른쪽: 업종/테마 상위 + 오늘 브리핑 — TOP종목의 행 목록은 원래 오른쪽보다
          훨씬 길어서, CSS의 stretch만으로는 왼쪽을 오른쪽 높이로 "줄일" 수 없다(stretch는 짧은 쪽을
          늘리기만 함). HeightMatchedRow가 오른쪽의 실제 렌더링 높이를 측정해서 왼쪽에 그대로
          씌우고, 넘치는 종목은 StockTable 내부에서 스크롤된다. */}
      <HeightMatchedRow
        left={
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
        }
        right={
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.85fr", gap: 16, alignItems: "stretch" }}>
              <SectorLeadersPanel compact groups={[{ title: "업종상위", items: sectorLeaders }]} />
              <SectorLeadersPanel compact groups={[{ title: "테마상위", items: themeLeaders }]} />
              <IndexQuotePanel initialQuotes={indexQuotes} />
            </div>
            <AiBriefing date={date} slot={briefingSlot} contributors={agg.contributors} />
          </>
        }
      />

      {/* 자금 흐름 — [시장 관심 상위 테마|테마별 종목] 위, [순매수·순매도 상위|그 종목] 아래.
          종목 칸(오른쪽)엔 종목 칩이 원래 넓게 필요해서 왼쪽(데이터 표)보다 넓게 배분.
          alignItems: stretch로 각 행 안의 두 칸 높이를 서로 맞춤. 두 줄을 별도 그리드로
          나눈 이유: 순매수·순매도 상위 테마는 칩이 없어 내용이 훨씬 좁아서, 같은 0.8fr을
          주면 가로 스크롤이 생긴다 — 그 줄만 왼쪽 비중을 높여 스크롤 없이 들어가게 했다. */}
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 20, alignItems: "stretch" }}>
        <MoneyFlowPanel days={moneyFlowDays} themes={moneyFlowThemes} />
        <MoneyFlowStocksPanel themes={moneyFlowStockGroups} />
      </div>
      {/* 왼쪽은 max-content로 표 내용 폭에 딱 맞춰 카드가 늘어나고(빈 여백 없이),
          남는 공간은 전부 오른쪽(1fr)이 가져간다 — 설명 문단에 maxWidth를 줘서
          이 계산을 표 폭이 주도하게 만들었다(그 문단 자체가 원래 한 줄 폭으로
          치면 표보다 넓어서, 안 그러면 카드가 쓸데없이 넓어진다). */}
      <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: 20, alignItems: "stretch" }}>
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
