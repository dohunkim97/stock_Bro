import { fetchKisChart } from "@/lib/kis-chart";

export type DailyChangePoint = {
  date: string; // YYYY-MM-DD
  dayIndex: number; // 1-based trading-day count since the candidate was first predicted
  changePct: number; // cumulative % vs basePrice, using that day's close
};

// Day-by-day 종가 기준 누적 등락률 since a candidate was first predicted —
// "1일차 +2.3%, 2일차 +1.8% (1일차 대비 누적)" — instead of a single number
// that ticks with the live intraday price every time the page refreshes.
// Only trading days on/after firstSeenAt's calendar date get a slot, so
// weekends/holidays don't produce empty "day N"s. The most recent point
// (today, if the market's still open) reflects that day's running close
// and finalizes naturally once the session ends — not specially excluded.
export async function getDailyChangeSeries(
  code: string,
  basePrice: number,
  firstSeenAtISO: string
): Promise<DailyChangePoint[]> {
  if (!basePrice || basePrice <= 0 || !firstSeenAtISO) return [];
  const firstDate = firstSeenAtISO.slice(0, 10); // ISO datetime -> YYYY-MM-DD
  const candles = await fetchKisChart(code, "D");
  return candles
    .filter((c) => c.date >= firstDate)
    .map((c, i) => ({
      date: c.date,
      dayIndex: i + 1,
      changePct: ((c.close - basePrice) / basePrice) * 100,
    }));
}
