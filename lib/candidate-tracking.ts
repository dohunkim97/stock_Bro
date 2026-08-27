import type { ChartCandle } from "@/lib/kis-chart";

// Every prediction's tracking window: exactly 5 trading days from the day
// it was published, matching the assumed buy — that day's 15:30 종가.
export const TRACKING_WINDOW_DAYS = 5;

export type DailyChangePoint = {
  date: string; // YYYY-MM-DD
  dayIndex: number; // 1-based trading-day count since the prediction's forDate
  changePct: number; // cumulative % vs forDate's own closing price
};

// Day-by-day 종가 기준 누적 등락률 for exactly TRACKING_WINDOW_DAYS trading
// days from a prediction's forDate — anchored to "그날 오후 3시 30분 종가에
// 매수했다": forDate's own close is the baseline every later day (including
// day 1 itself, which is therefore always 0%) is measured against. Only
// trading days on/after forDate get a slot, so weekends/holidays don't
// produce empty "day N"s, and the series is capped at
// TRACKING_WINDOW_DAYS even if more candles are available — a prediction's
// tracked lifecycle is exactly 5 trading days, not open-ended.
export function getDailyChangeSeries(candles: ChartCandle[], forDate: string): DailyChangePoint[] {
  if (!forDate) return [];
  const relevant = candles.filter((c) => c.date >= forDate).slice(0, TRACKING_WINDOW_DAYS);
  if (relevant.length === 0) return [];

  const basePrice = relevant[0].close;
  if (!basePrice || basePrice <= 0) return [];

  return relevant.map((c, i) => ({
    date: c.date,
    dayIndex: i + 1,
    changePct: ((c.close - basePrice) / basePrice) * 100,
  }));
}
