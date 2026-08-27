import type { ChartCandle } from "@/lib/kis-chart";

// Computable technical-analysis signals derived from real daily OHLCV data
// (not the LLM "recalling" a book concept) — rules transcribed from user-
// supplied trading-book material on 지지/저항(support/resistance) and
// 거래량(volume). Each detector below cites which rule it implements.
//
// What's precisely computable from candles alone (built here): candle
// color, volume change vs prior day, short-term drawdown, distance from
// the 5일선(5-day MA), historical-low proximity, prior-low breakdown +
// "바닥 확인", and support/resistance levels via swing-pivot detection.
// What ISN'T (skipped, by design): "전일 모든 악재 터짐" — that's a news
// judgment call, not a price pattern; the app's real per-stock 뉴스 이슈
// data (lib/kis-news.ts, DailyEntry.issue) already covers that separately
// and shouldn't be faked as a price-derived signal.

export type SignalDirection = "bullish" | "bearish" | "neutral";
export type TechnicalSignal = {
  name: string;
  detail: string;
  direction: SignalDirection;
};

function sma(candles: ChartCandle[], period: number, endIndex: number): number | null {
  if (endIndex + 1 < period) return null;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) sum += candles[i].close;
  return sum / period;
}

const isBearish = (c: ChartCandle) => c.close < c.open; // 음봉
const isBullish = (c: ChartCandle) => c.close > c.open; // 양봉
const fmt = (n: number) => Math.round(n).toLocaleString();

// --- 거래량/캔들 신호 (책 "거래량" 항목 1-6) ---
function volumeAndCandleSignals(candles: ChartCandle[]): TechnicalSignal[] {
  const signals: TechnicalSignal[] = [];
  const i = candles.length - 1;
  const today = candles[i];
  const prev = candles[i - 1];
  if (!prev || prev.volume <= 0) return signals;

  const volRatio = today.volume / prev.volume; // 1.0 = 전일과 동일

  // 거래량 1) 바닥에서 거래량 폭증 — 전 거래일 대비 500%+ 급증
  if (volRatio >= 5) {
    signals.push({
      name: "거래량 폭증",
      detail: `전일 대비 거래량 +${Math.round((volRatio - 1) * 100)}% — 바닥권 매수세 유입 패턴과 유사`,
      direction: "bullish",
    });
  }

  // 거래량 2)+3)+4) 거래량 급감(25% 이하, 12% 미만이면 베스트) — 음봉과 겹치면
  // "거래량 감소 + 음봉" 조합, 감소 폭·음봉 크기가 클수록 다음날 상승 확률↑
  if (volRatio <= 0.25) {
    const best = volRatio <= 0.12;
    const bearish = isBearish(today);
    const dropPct = (1 - volRatio) * 100;
    const candleBodyPct = today.open > 0 ? ((today.open - today.close) / today.open) * 100 : 0;

    signals.push({
      name: "거래량 급감",
      detail: `전일 대비 거래량 ${Math.round(volRatio * 100)}% 수준(−${Math.round(dropPct)}%)${best ? " — 베스트 구간(12% 미만)" : ""}`,
      direction: "neutral",
    });

    if (bearish) {
      signals.push({
        name: "거래량 급감 + 음봉",
        detail: `거래량 급감(−${Math.round(dropPct)}%) + 음봉(몸통 −${candleBodyPct.toFixed(1)}%) 동시 발생 — 감소·음봉 폭이 클수록 다음날 반등 확률↑로 알려진 패턴`,
        direction: "bullish",
      });
    }
  }

  // 거래량 5) 급감 시 5일선 이격도 — 너무 벌어지면 위험, 맞닿으면(근접) 좋음
  const ma5 = sma(candles, 5, i);
  if (ma5 && volRatio <= 0.25) {
    const gapPct = ((today.close - ma5) / ma5) * 100;
    const near = Math.abs(gapPct) <= 3;
    signals.push({
      name: "5일선 이격도",
      detail: `거래량 급감 시점 종가가 5일선 대비 ${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(1)}% — ${near ? "근접(지지 확인 가능)" : "이격 과다(주의, 5일선을 크게 이탈)"}`,
      direction: near ? "bullish" : "bearish",
    });
  }

  return signals;
}

// --- 단기 급락 (지지/저항 8: 최대 14거래일 내 -50%) ---
function shortTermCrashSignal(candles: ChartCandle[]): TechnicalSignal[] {
  const lookback = Math.min(14, candles.length);
  const window = candles.slice(candles.length - lookback);
  const windowHigh = Math.max(...window.map((c) => c.high));
  const today = candles[candles.length - 1];
  if (windowHigh <= 0) return [];

  const dropPct = ((windowHigh - today.close) / windowHigh) * 100;
  if (dropPct < 50) return [];

  return [
    {
      name: "단기 급락",
      detail: `최근 ${lookback}거래일 고점(${fmt(windowHigh)}) 대비 −${Math.round(dropPct)}%`,
      direction: "bearish",
    },
  ];
}

// --- 역사적 저점 터치 (지지/저항 5) ---
function historicalLowSignal(candles: ChartCandle[]): TechnicalSignal[] {
  const today = candles[candles.length - 1];
  const histLow = Math.min(...candles.map((c) => c.low));
  if (histLow <= 0) return [];

  const distPct = ((today.low - histLow) / histLow) * 100;
  if (distPct > 3) return [];

  return [
    {
      name: "역사적 저점 근접",
      detail: `조회 기간(최근 ${candles.length}거래일) 내 최저가(${fmt(histLow)}) 대비 +${distPct.toFixed(1)}%`,
      direction: "bullish",
    },
  ];
}

// --- 전저점 붕괴 + 바닥 확인 (지지/저항 6) ---
// "바닥 기준: 거래량 증가와 함께 주가가 -5% 이상 추가로 빠질 때 바닥으로 인식"
function priorLowBreakdownSignal(candles: ChartCandle[]): TechnicalSignal[] {
  if (candles.length < 21) return []; // 전저점을 볼 최소한의 이전 구간 필요
  const i = candles.length - 1;
  const today = candles[i];
  const prev = candles[i - 1];
  if (!prev || prev.close <= 0) return [];

  const priorLow = Math.min(...candles.slice(0, i).map((c) => c.close));
  const brokeDown = today.close < priorLow;
  const volUp = today.volume > prev.volume;
  const dropTodayPct = ((prev.close - today.close) / prev.close) * 100;

  if (!(brokeDown && volUp && dropTodayPct >= 5)) return [];

  return [
    {
      name: "전저점 붕괴 · 바닥 확인 패턴",
      detail: `전저점(${fmt(priorLow)}) 하회 + 거래량 증가 + 당일 −${dropTodayPct.toFixed(1)}% — 책 기준 "바닥"으로 인식되는 조합`,
      direction: "bullish",
    },
  ];
}

// --- 지지/저항 레벨 (스윙 고점/저점 기반) ---
export type SupportResistanceLevel = {
  price: number;
  touches: number;
  type: "support" | "resistance" | "both";
};

// 스윙 고점/저점: 앞뒤 `span`개 캔들 구간에서 가장 높은/낮은 값이면 피벗으로
// 인정. 근접한 피벗(가격 차이 tolerancePct 이내)은 하나의 레벨로 병합해
// touches(터치 횟수)를 누적 — "지지와 저항이 가장 잘 먹힐 때는 첫 번째"
// (지지/저항 4) 룰을 판단하려면 이 touches가 필요.
function findSwingPivots(candles: ChartCandle[], span = 5): { price: number; type: "high" | "low" }[] {
  const pivots: { price: number; type: "high" | "low" }[] = [];
  for (let i = span; i < candles.length - span; i++) {
    const window = candles.slice(i - span, i + span + 1);
    if (candles[i].high === Math.max(...window.map((c) => c.high))) {
      pivots.push({ price: candles[i].high, type: "high" });
    }
    if (candles[i].low === Math.min(...window.map((c) => c.low))) {
      pivots.push({ price: candles[i].low, type: "low" });
    }
  }
  return pivots;
}

export function findSupportResistanceLevels(candles: ChartCandle[], tolerancePct = 3): SupportResistanceLevel[] {
  const pivots = findSwingPivots(candles);
  const levels: SupportResistanceLevel[] = [];

  for (const p of pivots) {
    const existing = levels.find((l) => Math.abs((l.price - p.price) / p.price) * 100 <= tolerancePct);
    const kind = p.type === "high" ? "resistance" : "support";
    if (existing) {
      existing.price = (existing.price * existing.touches + p.price) / (existing.touches + 1);
      existing.touches += 1;
      if (existing.type !== kind) existing.type = "both";
    } else {
      levels.push({ price: p.price, touches: 1, type: kind });
    }
  }

  return levels.sort((a, b) => b.touches - a.touches);
}

// --- 지지/저항 신호: 저항 강력 돌파(1,3), 지지 확인(1,2) ---
function supportResistanceSignals(candles: ChartCandle[]): TechnicalSignal[] {
  if (candles.length < 30) return [];
  const signals: TechnicalSignal[] = [];
  const i = candles.length - 1;
  const today = candles[i];
  const prev = candles[i - 1];
  if (!prev) return signals;

  // 오늘을 제외한 과거 구간에서만 레벨을 찾아야 "오늘 그 레벨을 어떻게
  // 대했는지"를 판단할 수 있음 (오늘 자신이 피벗이 되어버리면 순환 참조).
  const levels = findSupportResistanceLevels(candles.slice(0, i));
  const volRatio = prev.volume > 0 ? today.volume / prev.volume : 0;

  for (const level of levels) {
    const distPct = ((today.close - level.price) / level.price) * 100;

    // 지지/저항 3) 저항선을 강력하게(거래량 동반) 돌파 — 매수 시점
    if (level.type !== "support" && prev.close < level.price && today.close > level.price && volRatio >= 1.5) {
      signals.push({
        name: "저항선 강력 돌파",
        detail: `저항선(${fmt(level.price)}, ${level.touches}회 터치) 상향 돌파 + 거래량 ${Math.round(volRatio * 100)}% 동반 — 거래량 실린 강한 돌파`,
        direction: "bullish",
      });
    }

    // 지지/저항 1)+4) 지지선 근접, 이탈 없이 유지 — 특히 첫 번째 지지가 신뢰도 높음
    if (level.type !== "resistance" && Math.abs(distPct) <= 3 && today.close >= level.price) {
      signals.push({
        name: level.touches === 1 ? "첫 지지선 지지 확인" : "지지선 지지 확인",
        detail: `지지선(${fmt(level.price)}, ${level.touches}회 터치) 근접, 이탈 없이 유지${level.touches === 1 ? " — 책 기준 신뢰도 가장 높은 '첫 지지'" : ""}`,
        direction: "bullish",
      });
    }

    // 지지/저항 2) 저항선을 못 뚫고 내려앉음 — 매도 시점
    if (level.type !== "support" && Math.abs(((prev.high - level.price) / level.price) * 100) <= 3 && today.close < level.price) {
      signals.push({
        name: "저항선 돌파 실패",
        detail: `저항선(${fmt(level.price)}, ${level.touches}회 터치) 근접 후 못 뚫고 하락 전환`,
        direction: "bearish",
      });
    }
  }

  return signals;
}

// Runs every detector against one stock's daily candles (chronological,
// oldest→newest — the same shape lib/kis-chart.ts's fetchKisChart already
// returns) and reports whatever's currently active on the latest candle.
export function computeTechnicalSignals(candles: ChartCandle[]): TechnicalSignal[] {
  if (candles.length < 2) return [];
  return [
    ...volumeAndCandleSignals(candles),
    ...shortTermCrashSignal(candles),
    ...historicalLowSignal(candles),
    ...priorLowBreakdownSignal(candles),
    ...supportResistanceSignals(candles),
  ];
}
