import type { ChartCandle } from "@/lib/kis-chart";

// Computable technical-analysis signals derived from real daily OHLCV data
// (not the LLM "recalling" a book concept) — rules transcribed from user-
// supplied trading-book material on 지지/저항(support/resistance), 거래량
// (volume), and 이동평균선(moving averages). Each detector below cites
// which rule it implements.
//
// What's precisely computable from candles alone (built here): candle
// color, volume change vs prior day, short-term drawdown, distance from
// the 5일선(5-day MA), historical-low proximity, prior-low breakdown +
// "바닥 확인", support/resistance levels via swing-pivot detection, and
// moving-average stacking/지지/붕괴 patterns (3/5/8/10/33/45/300/480일선,
// with a 120일선 caution overlay).
// What ISN'T (skipped, by design): "전일 모든 악재 터짐" — that's a news
// judgment call, not a price pattern; the app's real per-stock 뉴스 이슈
// data (lib/kis-news.ts, DailyEntry.issue) already covers that separately
// and shouldn't be faked as a price-derived signal. Also skipped: the
// book's 360일선 회귀 rule (not requested for computation the way
// 300/480일선 were) — it needs a 360-day MA plus a second MA point ~20
// trading days earlier to confirm the line is rising. The 300/480일선
// detectors below need similarly deep history (480+ candles, i.e. ~2
// years of daily data) — lib/kis-chart.ts's fetchKisChart defaults to a
// lighter ~300-candle fetch for most callers, and only the callers that
// actually compute these long-term signals request the deeper
// LONG_TERM_SIGNAL_CANDLES history explicitly, so chart-display and
// short-window callers don't pay the extra latency.

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
  // 이 레벨을 이룬 실제 스윙 고점/저점 날짜들(최신순) — 차트에 "여기서
  // 이 라인을 실제로 터치했다"는 동그라미를 찍을 때 쓴다. computeTechnical
  // Signals의 "오늘 기준" 판단과 달리, 이건 그 레벨이 과거에 실제로
  // 만들어진 지점 자체를 가리킨다.
  touchDates: string[];
};

// 스윙 고점/저점: 앞뒤 `span`개 캔들 구간에서 가장 높은/낮은 값이면 피벗으로
// 인정. 근접한 피벗(가격 차이 tolerancePct 이내)은 하나의 레벨로 병합해
// touches(터치 횟수)를 누적 — "지지와 저항이 가장 잘 먹힐 때는 첫 번째"
// (지지/저항 4) 룰을 판단하려면 이 touches가 필요.
function findSwingPivots(candles: ChartCandle[], span = 5): { price: number; type: "high" | "low"; date: string }[] {
  const pivots: { price: number; type: "high" | "low"; date: string }[] = [];
  for (let i = span; i < candles.length - span; i++) {
    const window = candles.slice(i - span, i + span + 1);
    if (candles[i].high === Math.max(...window.map((c) => c.high))) {
      pivots.push({ price: candles[i].high, type: "high", date: candles[i].date });
    }
    if (candles[i].low === Math.min(...window.map((c) => c.low))) {
      pivots.push({ price: candles[i].low, type: "low", date: candles[i].date });
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
      existing.touchDates.push(p.date);
      if (existing.type !== kind) existing.type = "both";
    } else {
      levels.push({ price: p.price, touches: 1, type: kind, touchDates: [p.date] });
    }
  }

  for (const l of levels) l.touchDates.sort().reverse(); // most recent touch first
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

// --- 이동평균선 배열 (정배열/역배열) ---
// "이동평균선 배열이 3,5,10이 아닌 10,5,3을 말함(역추세)" — 3일선이 5일선
// 위, 5일선이 10일선 위면 단기 추세가 정배열(우상향 정렬), 반대면 역배열.
function maOrderSignal(candles: ChartCandle[]): TechnicalSignal[] {
  const i = candles.length - 1;
  const ma3 = sma(candles, 3, i);
  const ma5 = sma(candles, 5, i);
  const ma10 = sma(candles, 10, i);
  if (ma3 === null || ma5 === null || ma10 === null) return [];

  if (ma3 > ma5 && ma5 > ma10) {
    return [
      {
        name: "이동평균선 정배열",
        detail: `3일선(${fmt(ma3)}) > 5일선(${fmt(ma5)}) > 10일선(${fmt(ma10)}) — 단기 추세가 우상향으로 정렬된 상태`,
        direction: "bullish",
      },
    ];
  }
  if (ma3 < ma5 && ma5 < ma10) {
    return [
      {
        name: "이동평균선 역배열",
        detail: `3일선(${fmt(ma3)}) < 5일선(${fmt(ma5)}) < 10일선(${fmt(ma10)}) — 단기 추세가 역행 중(역추세)`,
        direction: "bearish",
      },
    ];
  }
  return [];
}

// --- 3일선 지지 (바닥권 첫 상한가 이후) ---
// "바닥권에서 '이유 있는' 첫 상한가를 기록하고 상승 추세로 바뀌는 종목은
// 3일선을 탄다" — 최근 상한가(+29%+ 근사) 이전 구간이 바닥권이었는지, 그
// 이후 지금까지 3일선 위에서 유지되고 있는지를 확인.
function firstLimitUpThreeDaySignal(candles: ChartCandle[]): TechnicalSignal[] {
  const i = candles.length - 1;
  const lookback = Math.min(20, i);
  let surgeIdx = -1;
  for (let j = i - 1; j >= Math.max(1, i - lookback); j--) {
    const prevC = candles[j - 1];
    if (!prevC || prevC.close <= 0) continue;
    const chg = ((candles[j].close - prevC.close) / prevC.close) * 100;
    if (chg >= 29) {
      surgeIdx = j;
      break;
    }
  }
  if (surgeIdx === -1) return [];

  const priorWindow = candles.slice(Math.max(0, surgeIdx - 60), surgeIdx);
  if (priorWindow.length < 10) return [];
  const priorLow = Math.min(...priorWindow.map((c) => c.low));
  if (priorLow <= 0) return [];
  // "바닥권"인지는 상한가를 맞기 '직전' 가격이 최근 저점 근처였는지로 판단
  // — 상한가 당일 종가 자체는 정의상 전일 대비 +29%±라, 그 값을 저점과
  // 비교하면 진짜 바닥권 여부와 무관하게 항상 25%+ 차이가 나서 늘 걸러짐.
  const preSurgeClose = candles[surgeIdx - 1].close;
  if (((preSurgeClose - priorLow) / priorLow) * 100 > 25) return []; // 바닥권 아니면 해당 없음

  const ma3 = sma(candles, 3, i);
  const today = candles[i];
  if (ma3 === null || today.close < ma3) return []; // 이미 3일선 이탈 — "타는 중" 아님

  const surgePct = ((candles[surgeIdx].close - candles[surgeIdx - 1].close) / candles[surgeIdx - 1].close) * 100;
  return [
    {
      name: "3일선 지지 (바닥권 상한가 이후)",
      detail: `${candles[surgeIdx].date} 바닥권 상한가(+${Math.round(surgePct)}%) 이후 3일선(${fmt(ma3)}) 위에서 지지 유지 중`,
      direction: "bullish",
    },
  ];
}

// --- 8일선 지지 (3·5일선 이탈 후 대체 지지선) ---
// "3,5일선에서 지지를 받지 못한 급등주는 8일선이 강력한 지지선이 된다
// (그 다음 지지선은 20일선일 확률이 매우 높다)"
function eightDayLineSignal(candles: ChartCandle[]): TechnicalSignal[] {
  const i = candles.length - 1;
  const ma3 = sma(candles, 3, i);
  const ma5 = sma(candles, 5, i);
  const ma8 = sma(candles, 8, i);
  if (ma3 === null || ma5 === null || ma8 === null) return [];

  const today = candles[i];
  if (today.close < ma3 && today.close < ma5 && today.close >= ma8) {
    return [
      {
        name: "8일선 지지",
        detail: `3일선·5일선은 이탈했지만 8일선(${fmt(ma8)})에서 지지 확인 — 다음 지지선은 20일선일 확률이 높음`,
        direction: "bullish",
      },
    ];
  }
  return [];
}

// --- 33일선 정찰병 매수 ---
// "33일선 - 45일선 정찰병. 33일선에서 지지를 받고 있을 시 정찰병(일부 매수)"
function scoutBuySignal(candles: ChartCandle[]): TechnicalSignal[] {
  const i = candles.length - 1;
  const ma33 = sma(candles, 33, i);
  if (ma33 === null) return [];

  const today = candles[i];
  const gapPct = ((today.close - ma33) / ma33) * 100;
  if (today.close >= ma33 && gapPct <= 3) {
    return [
      {
        name: "33일선 정찰병 매수 구간",
        detail: `33일선(${fmt(ma33)}) 근접 지지 — 45일선 도달 전 일부 매수(정찰병) 관찰 구간`,
        direction: "bullish",
      },
    ];
  }
  return [];
}

// --- 45일선 반등 (낙주매매) ---
// "하루 20%+ 급등 이후 처음 45일선에 닿을 때 거래량이 줄면서 음봉마감하면
// 반등 — 첫 터치 이후로는 확률이 낮으니 무시. 120일선 같은 장기선이 위에
// 있으면 주의(맞고 떨어지는 경우가 잦음). 단, 45일선 닿을 때 거래량이
// 늘어난 상태면 무조건 제외."
function fortyFiveDayReboundSignal(candles: ChartCandle[]): TechnicalSignal[] {
  const i = candles.length - 1;
  const ma45 = sma(candles, 45, i);
  if (ma45 === null) return [];

  const lookback = Math.min(60, i);
  let surgeIdx = -1;
  for (let j = i - 1; j >= Math.max(1, i - lookback); j--) {
    const prevC = candles[j - 1];
    if (!prevC || prevC.close <= 0) continue;
    const chg = ((candles[j].close - prevC.close) / prevC.close) * 100;
    if (chg >= 20) {
      surgeIdx = j;
      break;
    }
  }
  if (surgeIdx === -1) return [];

  // 급등 이후 오늘 이전에 이미 45일선을 터치한 적 있다면 "처음"이 아니므로
  // 책 기준 무시.
  for (let j = surgeIdx + 1; j < i; j++) {
    const maAtJ = sma(candles, 45, j);
    if (maAtJ === null) continue;
    if (Math.abs((candles[j].close - maAtJ) / maAtJ) * 100 <= 2) return [];
  }

  const today = candles[i];
  if (Math.abs((today.close - ma45) / ma45) * 100 > 2) return []; // 오늘도 아직 터치 전

  const prev = candles[i - 1];
  const volUp = prev && prev.volume > 0 ? today.volume > prev.volume : false;
  const surgePct = ((candles[surgeIdx].close - candles[surgeIdx - 1].close) / candles[surgeIdx - 1].close) * 100;

  if (volUp) {
    return [
      {
        name: "45일선 터치 (반등 신호 제외)",
        detail: `${candles[surgeIdx].date} 급등(+${Math.round(surgePct)}%) 이후 첫 45일선(${fmt(ma45)}) 터치이지만 거래량이 늘어난 상태 — 책 기준 반등 신호에서 제외되는 조건`,
        direction: "bearish",
      },
    ];
  }

  if (!isBearish(today)) return []; // 거래량은 줄었지만 음봉이 아니면 책의 반등 조건과 정확히 일치하지 않음

  const ma120 = sma(candles, 120, i);
  const caution = ma120 !== null && today.close < ma120 ? " (단, 120일선이 위에 있어 주의 — 저항으로 작용할 수 있음)" : "";

  return [
    {
      name: "45일선 반등",
      detail: `${candles[surgeIdx].date} 급등(+${Math.round(surgePct)}%) 이후 첫 45일선(${fmt(ma45)}) 터치, 거래량 감소+음봉 — 반등 기대 구간${caution}`,
      direction: "bullish",
    },
  ];
}

// --- 장기 이평선 지지/붕괴 (300일선, 480일선) ---
// 사용자 지시: "480일선이 최후의 이평선으로 지지 못 받는 거는 위험해서
// 매도해야 하는 걸로" — 480일선은 마지막 장기 지지선 취급, 이걸 이탈하면
// 위험 신호로 매도 검토. 300일선은 그보다 앞선 장기 지지선으로 같은
// 지지/붕괴 패턴을 적용하되 "최후"라는 강조는 480일선에만 붙인다.
function longTermMaSignal(candles: ChartCandle[], period: number, label: string, isFinal: boolean): TechnicalSignal[] {
  const i = candles.length - 1;
  const ma = sma(candles, period, i);
  const prevMa = sma(candles, period, i - 1);
  if (ma === null || prevMa === null) return [];

  const today = candles[i];
  const prev = candles[i - 1];
  if (!prev) return [];

  // 어제까지는 이 지지선 위/근접이었는지 먼저 확인 — 애초에 그 라인 근처에
  // 있지도 않았던 종목을 "붕괴"로 잡으면 과잉 신호가 된다.
  const wasHolding = prev.close >= prevMa || Math.abs((prev.close - prevMa) / prevMa) * 100 <= 5;
  const brokeToday = today.close < ma && ((ma - today.close) / ma) * 100 >= 2;

  if (wasHolding && brokeToday) {
    return [
      {
        name: `${label} 붕괴${isFinal ? " (최후 지지선 이탈)" : ""}`,
        detail: `${label}(${fmt(ma)}) 지지가 깨짐${isFinal ? " — 장기 이평선 중 마지막 지지선인 만큼 위험 신호, 매도 검토" : " — 장기 추세 이탈 주의"}`,
        direction: "bearish",
      },
    ];
  }

  if (today.close >= ma && Math.abs((today.close - ma) / ma) * 100 <= 3) {
    return [
      {
        name: `${label} 지지 확인`,
        detail: `${label}(${fmt(ma)}) 근접 지지 유지 중${isFinal ? " — 최후 지지선 사수 중" : ""}`,
        direction: "bullish",
      },
    ];
  }

  return [];
}

// 480일선 + 전일 대비 시점(i-1)까지 계산하려면 481개 이상의 캔들이 필요 —
// 주말/휴장일 편차를 감안한 여유분을 더해 이 값을 요청하면 fetchKisChart가
// 그만큼 더 페이징해서 가져온다 (lib/kis-chart.ts 참고). 이 값을 요청하지
// 않는 호출부(차트 표시, 단기 시그널만 쓰는 곳)는 기존 기본값(~300개) 그대로다.
export const LONG_TERM_SIGNAL_CANDLES = 520;

function longTermTrendSignals(candles: ChartCandle[]): TechnicalSignal[] {
  return [
    ...longTermMaSignal(candles, 300, "300일선", false),
    ...longTermMaSignal(candles, 480, "480일선", true),
  ];
}

function movingAverageSignals(candles: ChartCandle[]): TechnicalSignal[] {
  if (candles.length < 10) return [];
  return [
    ...maOrderSignal(candles),
    ...firstLimitUpThreeDaySignal(candles),
    ...eightDayLineSignal(candles),
    ...scoutBuySignal(candles),
    ...fortyFiveDayReboundSignal(candles),
    ...longTermTrendSignals(candles),
  ];
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
    ...movingAverageSignals(candles),
  ];
}

// --- 차트 스토리 어노테이션 (지지/저항 전환 스토리라인) ---
// 사용자가 참고한 UI 아이디어(번호 매긴 ①②③ 마커 + 툴팁으로 지지/저항
// 스토리를 보여주는 것)는 그대로 가져오되, 내용 자체는 예시로 준 고정된
// 5단계 서사(10,500원 저항 실패→...→돌파 성공)를 하드코딩하지 않는다 —
// 실제 종목마다 그 흐름이 다르므로, 이미 계산돼 있는 핵심 지지/저항선
// (findSupportResistanceLevels, "가장 많이 터치된 레벨"이 곧 "S/R 전환
// 핵심 구간")의 실제 터치 이력을 시간순으로 훑으며 각 터치가 돌파/실패/
// 지지/이탈 중 무엇이었는지 사후에 분류해서 만든다.
export type StoryEventType =
  | "RESISTANCE_FAIL"
  | "RESISTANCE_BREAK"
  | "SUPPORT_HOLD"
  | "SUPPORT_BREAK"
  | "VOLUME_SPIKE"
  | "GOLDEN_CROSS";

export type ChartStoryAnnotation = {
  date: string;
  price: number;
  stepNumber: number; // 1부터, 시간순
  type: StoryEventType;
  badgeLabel: string;
  description: string;
  direction: SignalDirection;
};

// 터치 시점 이후 최대 5거래일 동안의 가격 흐름을 보고 그 터치가 돌파로
// 이어졌는지(성공) 되밀렸는지(실패)를 사후 판정한다 — 책 규칙(저항 강력
// 돌파/실패, 지지 확인/이탈)과 같은 방향성이지만 "오늘" 기준이 아니라
// 과거 특정 터치 시점 기준으로 같은 판정을 반복 적용하는 것.
function classifyLevelTouch(
  candles: ChartCandle[],
  touchIdx: number,
  level: SupportResistanceLevel
): { type: StoryEventType; badgeLabel: string; description: string; direction: SignalDirection } | null {
  const lookahead = candles.slice(touchIdx + 1, touchIdx + 6);
  if (lookahead.length === 0) return null;

  if (level.type !== "support") {
    const broke = lookahead.some((c) => c.close > level.price * 1.02);
    if (broke) {
      return {
        type: "RESISTANCE_BREAK",
        badgeLabel: "저항 돌파 성공",
        description: `저항선(${fmt(level.price)}) 근접 이후 상향 돌파 확인 — 지지선으로 전환 가능성`,
        direction: "bullish",
      };
    }
    return {
      type: "RESISTANCE_FAIL",
      badgeLabel: "저항 실패",
      description: `저항선(${fmt(level.price)}) 근접 후 못 뚫고 하락 전환`,
      direction: "bearish",
    };
  }

  const brokeDown = lookahead.some((c) => c.close < level.price * 0.98);
  if (brokeDown) {
    return {
      type: "SUPPORT_BREAK",
      badgeLabel: "지지 이탈",
      description: `지지선(${fmt(level.price)}) 하향 이탈`,
      direction: "bearish",
    };
  }
  return {
    type: "SUPPORT_HOLD",
    badgeLabel: "지지 확인",
    description: `지지선(${fmt(level.price)}) 근접 후 이탈 없이 지지 유지`,
    direction: "bullish",
  };
}

// 5일선이 60일선을 상향 돌파한 가장 최근 시점 — 차트에 이미 그리고 있는
// 5/60/200일선(components/stock/price-chart.tsx)과 같은 두 선의 교차라
// 새 이평선을 추가하지 않고 계산만 더한다.
function detectGoldenCross(candles: ChartCandle[]): ChartStoryAnnotation | null {
  for (let i = candles.length - 1; i >= 61; i--) {
    const ma5now = sma(candles, 5, i);
    const ma60now = sma(candles, 60, i);
    const ma5prev = sma(candles, 5, i - 1);
    const ma60prev = sma(candles, 60, i - 1);
    if (ma5now === null || ma60now === null || ma5prev === null || ma60prev === null) continue;
    if (ma5prev <= ma60prev && ma5now > ma60now) {
      return {
        date: candles[i].date,
        price: candles[i].close,
        stepNumber: 0, // buildChartStory가 최종 정렬 후 다시 매김
        type: "GOLDEN_CROSS",
        badgeLabel: "골든크로스",
        description: "5일선이 60일선을 상향 돌파 — 중기 추세 전환 신호",
        direction: "bullish",
      };
    }
  }
  return null;
}

// 가장 많이 터치된(=가장 신뢰도 높은) 레벨 하나를 "핵심 기준선"으로 골라
// 그 터치 이력 + 거래량 급증 + 골든크로스를 시간순으로 합쳐 최근 5개만
// 남기고 ①~⑤ 번호를 매긴다 — 레벨 자체(가격/터치횟수)는
// findSupportResistanceLevels(candles)[0]과 항상 같아서, 호출부가 이미
// 그 레벨을 별도로 그리고 있다면 중복 계산할 필요 없이 이 함수 하나만
// 더 부르면 된다.
export function buildChartStory(candles: ChartCandle[]): ChartStoryAnnotation[] {
  const levels = findSupportResistanceLevels(candles);
  if (levels.length === 0) return [];
  const keyLevel = levels[0];

  const events: Omit<ChartStoryAnnotation, "stepNumber">[] = [];
  const chronologicalTouches = [...keyLevel.touchDates].sort(); // touchDates is most-recent-first; undo that here

  for (const date of chronologicalTouches) {
    const idx = candles.findIndex((c) => c.date === date);
    if (idx === -1) continue;

    const classified = classifyLevelTouch(candles, idx, keyLevel);
    if (classified) events.push({ date, price: candles[idx].close, ...classified });

    const prevVol = candles[idx - 1]?.volume;
    if (prevVol && prevVol > 0 && candles[idx].volume / prevVol >= 3) {
      events.push({
        date,
        price: candles[idx].close,
        type: "VOLUME_SPIKE",
        badgeLabel: "거래량 급증",
        description: `전일 대비 거래량 +${Math.round((candles[idx].volume / prevVol - 1) * 100)}%`,
        direction: "neutral",
      });
    }
  }

  const golden = detectGoldenCross(candles);
  if (golden) events.push(golden);

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events.slice(-5).map((e, i) => ({ ...e, stepNumber: i + 1 }));
}
