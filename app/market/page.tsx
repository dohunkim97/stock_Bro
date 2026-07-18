import { PeriodDateNav } from "@/components/market/period-date-nav";
import { DayView } from "@/components/market/day-view";
import { ReportView } from "@/components/market/report-view";
import { getDayEntries, getRecentEntries } from "@/lib/market-data";
import { getWatchlist } from "@/lib/watchlist";
import { todayISO } from "@/lib/dates";
import { weekReport, monthReport } from "@/lib/reports-data";

const SECTOR_WINDOW_DAYS = 7;

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const params = await searchParams;
  const period = params.period === "week" || params.period === "month" ? params.period : "day";
  const date = params.date || todayISO();

  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "26px 24px 60px" }}>
      <PeriodDateNav period={period} date={date} />

      {period === "day" ? (
        <DayViewLoader date={date} />
      ) : (
        <ReportView
          report={period === "month" ? monthReport : weekReport}
          periodWord={period === "month" ? "월간" : "주간"}
        />
      )}
    </main>
  );
}

async function DayViewLoader({ date }: { date: string }) {
  const [{ volume, gainer }, recentEntries, watchlist] = await Promise.all([
    getDayEntries(date),
    getRecentEntries(SECTOR_WINDOW_DAYS),
    getWatchlist(),
  ]);
  return (
    <DayView
      date={date}
      volumeEntries={volume}
      gainerEntries={gainer}
      recentEntries={recentEntries}
      recentDays={SECTOR_WINDOW_DAYS}
      watchlist={watchlist}
    />
  );
}
