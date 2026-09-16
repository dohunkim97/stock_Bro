import type { ChartCandle } from "@/lib/kis-chart";

// Every prediction's tracking window: exactly 5 trading days from the day
// it was published, matching the assumed buy — that day's 15:30 종가.
export const TRACKING_WINDOW_DAYS = 5;

export type DailyChangePoint = {
  date: string; // YYYY-MM-DD
  dayIndex: number; // 1-based trading-day count since the prediction's forDate
  price: number; // that day's actual closing price — lets callers compare directly against a stop-loss/target price without reconstructing it from changePct
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
    price: c.close,
    changePct: ((c.close - basePrice) / basePrice) * 100,
  }));
}

export type TrackingOutcome = {
  hitTarget: boolean;
  hitTargetDayIndex: number | null; // 최초로 목표가에 닿은 거래일차
  hitStop: boolean;
  hitStopDayIndex: number | null; // 최초로 손절가에 닿은 거래일차
  finalChangePct: number | null; // 추적된 마지막 날의 누적 등락률(매수가 대비)
};

// components/bro/detail-card.tsx의 markDays(화면 표시용, "손절가 도달"을
// 최초 1회만/목표가는 한 번 찍으면 계속 유지)와 같은 규칙을 서버 쪽 집계
// (예: 주간 피드백 리포트)에서도 쓸 수 있게 옮겨온 버전 — 화면에는 날마다
// 표시가 필요해서 markDays를 그대로 두고, 이건 "최종적으로 어느 걸 겪었는지"
// 하나의 요약값만 필요한 곳에서 쓴다.
export function classifyOutcome(
  series: DailyChangePoint[],
  stopLossPrice: number | null,
  targetPrice: number | null
): TrackingOutcome {
  let belowStop = false;
  let targetAlreadyHit = false;
  let hitTarget = false;
  let hitTargetDayIndex: number | null = null;
  let hitStop = false;
  let hitStopDayIndex: number | null = null;

  for (const p of series) {
    const touchedStop = stopLossPrice !== null && p.price <= stopLossPrice;
    const touchedTarget = targetPrice !== null && p.price >= targetPrice;

    if (touchedTarget && !targetAlreadyHit) {
      hitTarget = true;
      hitTargetDayIndex = p.dayIndex;
      targetAlreadyHit = true;
    }
    if (touchedStop && !belowStop) {
      hitStop = true;
      if (hitStopDayIndex === null) hitStopDayIndex = p.dayIndex;
    }

    if (touchedStop) belowStop = true;
    else if (p.changePct >= 0) belowStop = false; // 매수가 복귀 — 다음 이탈은 새 사건
  }

  return {
    hitTarget,
    hitTargetDayIndex,
    hitStop,
    hitStopDayIndex,
    finalChangePct: series.length > 0 ? series[series.length - 1].changePct : null,
  };
}
