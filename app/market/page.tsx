import { PeriodDateNav } from "@/components/market/period-date-nav";
import { DayView } from "@/components/market/day-view";
import { ReportView } from "@/components/market/report-view";
import { getDayEntries, getEntriesInRange } from "@/lib/market-data";
import { getWatchlist } from "@/lib/watchlist";
import { latestBusinessDay } from "@/lib/dates";
import { currentWeekKey, weekInfoFromKey } from "@/lib/week";
import { weekReport, monthReport } from "@/lib/reports-data";

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string; sectorWeek?: string; briefingSlot?: string }>;
}) {
  const params = await searchParams;
  const period = params.period === "week" || params.period === "month" ? params.period : "day";
  const date = params.date || latestBusinessDay();
  const sectorWeek = params.sectorWeek || currentWeekKey();

  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "26px 24px 60px" }}>
      <PeriodDateNav period={period} date={date} sectorWeek={sectorWeek} />

      {period === "day" ? (
        <DayViewLoader date={date} sectorWeek={sectorWeek} briefingSlot={params.briefingSlot} />
      ) : (
        <ReportView
          report={period === "month" ? monthReport : weekReport}
          periodWord={period === "month" ? "월간" : "주간"}
        />
      )}
    </main>
  );
}

async function DayViewLoader({
  date,
  sectorWeek,
  briefingSlot,
}: {
  date: string;
  sectorWeek: string;
  briefingSlot?: string;
}) {
  const weekInfo = weekInfoFromKey(sectorWeek);
  const [{ volume, gainer }, weekEntries, watchlist] = await Promise.all([
    getDayEntries(date),
    getEntriesInRange(weekInfo.startISO, weekInfo.endISO),
    getWatchlist(),
  ]);
  return (
    <DayView
      date={date}
      briefingSlot={briefingSlot}
      volumeEntries={volume}
      gainerEntries={gainer}
      weekInfo={weekInfo}
      weekEntries={weekEntries}
      watchlist={watchlist}
    />
  );
}
