import { StockTable } from "./stock-table";
import { ExcelUploadButton } from "./excel-upload-button";
import { KrxSyncButton } from "./krx-sync-button";
import { MentionRanking } from "./mention-ranking";
import { WatchlistNews } from "./watchlist-news";
import { SectorContributors } from "./sector-contributors";
import { aggregateSectors } from "@/lib/sector-aggregation";
import { rankMostMentioned } from "@/lib/mention-ranking";
import type { DailyEntry, Watchlist } from "@/app/generated/prisma/client";

export function DayView({
  date,
  volumeEntries,
  gainerEntries,
  recentEntries,
  recentDays,
  watchlist,
}: {
  date: string;
  volumeEntries: DailyEntry[];
  gainerEntries: DailyEntry[];
  recentEntries: DailyEntry[];
  recentDays: number;
  watchlist: Watchlist[];
}) {
  const combined = recentEntries.map((e) => ({
    name: e.name,
    code: e.code,
    sector: e.sector,
    changePct: e.changePct,
  }));
  const agg = aggregateSectors(combined);
  const mentions = rankMostMentioned(recentEntries);

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
        {!agg.hasData ? (
          <div style={{ padding: "12px 0", color: "var(--dim)", fontSize: 14 }}>
            최근 {recentDays}일간 입력된 종목이 없어요. 상승 TOP·거래 TOP에 종목을 입력하면 주요
            섹터가 여기 나타나요.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 4 }}>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--accent)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                ▲ Weekly Hot Sector · 최근 {recentDays}일
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}>
                최근 {recentDays}일 시장이 주목한 섹터는{" "}
                <span style={{ color: "var(--accent)" }}>{agg.hotSector}</span>
              </h2>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--dim)" }}>
                랭킹 등장 {agg.totalCount}건 중{" "}
                <b style={{ color: "var(--text)" }}>{agg.hotSectorCount}건</b> 포함
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {agg.sectors.map((sec) => {
                  const isHot = sec.name === agg.hotSector;
                  const color = isHot ? "var(--accent)" : "var(--text)";
                  const barColor = isHot ? "var(--accent)" : "var(--dim)";
                  return (
                    <div key={sec.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color }}>{sec.name}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)" }}>
                          {sec.count}건 · <b style={{ color }}>{sec.pct}%</b>
                        </span>
                      </div>
                      <div style={{ height: 9, background: "var(--bg)", borderRadius: 6, overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${sec.width}%`,
                            background: barColor,
                            borderRadius: 6,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <SectorContributors hotSector={agg.hotSector ?? ""} contributors={agg.contributors} />
            </div>
          </>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <MentionRanking rows={mentions} days={recentDays} />
        <WatchlistNews items={watchlist} />
      </div>
    </div>
  );
}
