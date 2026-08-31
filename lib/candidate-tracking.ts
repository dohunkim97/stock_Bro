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
// days AFTER a prediction's forDate — anchored to "그날 오후 3시 30분 종가에
// 매수했다": forDate's own close is the baseline (매수가), but forDate itself
// isn't a tracked day (it'd always show 0%, since it IS the base price) — 1일차
// is the first trading day after the buy, and the window runs 5 trading days
// from there. The first candle at/after forDate anchors the base price (so a
// forDate that isn't itself a trading day, or whose candle hasn't synced yet,
// still resolves to the right buy price); everything after that anchor is the
// tracked window, capped at TRACKING_WINDOW_DAYS even if more candles exist —
// a prediction's tracked lifecycle is exactly 5 trading days, not open-ended.
export function getDailyChangeSeries(candles: ChartCandle[], forDate: string): DailyChangePoint[] {
  if (!forDate) return [];
  const baseIndex = candles.findIndex((c) => c.date >= forDate);
  if (baseIndex === -1) return [];

  const basePrice = candles[baseIndex].close;
  if (!basePrice || basePrice <= 0) return [];

  const after = candles.slice(baseIndex + 1, baseIndex + 1 + TRACKING_WINDOW_DAYS);
  return after.map((c, i) => ({
    date: c.date,
    dayIndex: i + 1,
    changePct: ((c.close - basePrice) / basePrice) * 100,
  }));
}
