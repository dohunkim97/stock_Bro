import Link from "next/link";
import { StockTable } from "./stock-table";
import { ExcelUploadButton } from "./excel-upload-button";
import { KrxSyncButton } from "./krx-sync-button";
import { WatchlistNews } from "./watchlist-news";
import { WeeklySectorPanel } from "./weekly-sector-panel";
import { aggregateSectors } from "@/lib/sector-aggregation";
import { rankMostMentioned } from "@/lib/mention-ranking";
import { prevWeekKey, nextWeekKey, type WeekInfo } from "@/lib/week";
import type { DailyEntry, Watchlist } from "@/app/generated/prisma/client";

const weekNavBtnStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--panel)",
  color: "var(--dim)",
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 11px",
  borderRadius: 8,
};

export function DayView({
  date,
  volumeEntries,
  gainerEntries,
  weekInfo,
  weekEntries,
  watchlist,
}: {
  date: string;
  volumeEntries: DailyEntry[];
  gainerEntries: DailyEntry[];
  weekInfo: WeekInfo;
  weekEntries: DailyEntry[];
  watchlist: Watchlist[];
}) {
  const combined = weekEntries.map((e) => ({
    name: e.name,
    code: e.code,
    sector: e.sector,
    changePct: e.changePct,
  }));
  const agg = aggregateSectors(combined);
  const mentions = rankMostMentioned(weekEntries, 50);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <KrxSyncButton date={date} />
        <ExcelUploadButton date={date} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <StockTable
          date={date}
          listType="gainer"
          title="급상승 종목"
          badgeText="상승 TOP"
          badgeColor="var(--up)"
          accentVar="var(--up)"
          accentSoftVar="var(--up-soft)"
          entries={gainerEntries}
          showVolumeField={false}
        />

        <StockTable
          date={date}
          listType="volume"
          title="거래량 상위"
          badgeText="거래 TOP"
          badgeColor="var(--dim)"
          accentVar="var(--accent)"
          accentSoftVar="var(--accent-soft)"
          entries={volumeEntries}
          showVolumeField
        />
      </div>

      {/* 주요 섹터 결과 (최근 N일) */}
      <section
        style={{
          background: "linear-gradient(180deg, var(--panel2), var(--panel))",
          border: "1px solid var(--border2)",
          borderRadius: 16,
          padding: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -20,
            width: 220,
            height: 220,
            background: "radial-gradient(circle, var(--accent-soft), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--accent)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            ▲ Weekly Hot Sector · {weekInfo.label}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link
              href={`/market?period=day&date=${date}&sectorWeek=${prevWeekKey(weekInfo.key)}`}
              style={weekNavBtnStyle}
            >
              ‹ 이전 주
            </Link>
            <Link
              href={`/market?period=day&date=${date}&sectorWeek=${nextWeekKey(weekInfo.key)}`}
              style={weekNavBtnStyle}
            >
              다음 주 ›
            </Link>
          </div>
        </div>

        {!agg.hasData ? (
          <div style={{ padding: "12px 0", color: "var(--dim)", fontSize: 14 }}>
            {weekInfo.label}에는 입력된 종목이 없어요. 상승 TOP·거래 TOP에 종목을 입력하면 주요
            섹터가 여기 나타나요.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}>
                {weekInfo.label} 시장이 주목한 섹터는{" "}
                <span style={{ color: "var(--accent)" }}>{agg.hotSector}</span>
              </h2>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--dim)" }}>
                랭킹 등장 {agg.totalCount}건 중{" "}
                <b style={{ color: "var(--text)" }}>{agg.hotSectorCount}건</b> 포함
              </span>
            </div>

            <WeeklySectorPanel agg={agg} mentions={mentions} />

            <div
              style={{
                marginTop: 20,
                padding: "14px 16px",
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>이 섹터가 강세였던 이유</span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    color: "var(--down)",
                    border: "1px solid var(--down)",
                    padding: "1px 6px",
                    borderRadius: 5,
                  }}
                >
                  AI 분석 연동 예정
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--faint)" }}>
                Bro AI가 연동되면 {weekInfo.label}에 {agg.hotSector} 섹터가 강세였던 이유를 자동으로
                요약해줄 예정이에요.
              </div>
            </div>
          </>
        )}
      </section>

      <WatchlistNews items={watchlist} />
    </div>
  );
}
