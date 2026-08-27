import type { ChartCandle } from "@/lib/kis-chart";

export type DailyChangePoint = {
  date: string; // YYYY-MM-DD
  dayIndex: number; // 1-based trading-day count since the candidate was first predicted
  changePct: number; // cumulative % vs day 1's opening price, using that day's close
};

// Day-by-day 종가 기준 누적 등락률 since a candidate was first predicted,
// anchored to "샀다면 예상 당일 9시 시가에 매수했다" — day 1's own opening
// price is the baseline every later day (including day 1 itself) is
// measured against, so day 1 shows its own intraday open→close move
// instead of always reading 0%. Only trading days on/after firstSeenAt's
// calendar date get a slot, so weekends/holidays don't produce empty
// "day N"s. The most recent point (today, if the market's still open)
// reflects that day's running close and finalizes naturally once the
// session ends — not specially excluded.
//
// Takes already-fetched candles rather than a code — callers that also
// need lib/technical-signals.ts's signals for the same stock (e.g.
// CandidateTracker) fetch fetchKisChart once and pass the result to both,
// instead of two separate API calls per candidate.
export function getDailyChangeSeries(candles: ChartCandle[], firstSeenAtISO: string): DailyChangePoint[] {
  if (!firstSeenAtISO) return [];
  const firstDate = firstSeenAtISO.slice(0, 10); // ISO datetime -> YYYY-MM-DD
  const relevant = candles.filter((c) => c.date >= firstDate);
  if (relevant.length === 0) return [];

  const openPrice = relevant[0].open;
  if (!openPrice || openPrice <= 0) return [];

  return relevant.map((c, i) => ({
    date: c.date,
    dayIndex: i + 1,
    changePct: ((c.close - openPrice) / openPrice) * 100,
  }));
}
