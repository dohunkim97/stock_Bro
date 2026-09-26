// 추천 "당시"의 수치 특성(features) — GPT 피드백의 핵심 원칙("Prediction
// Snapshot은 매수 시점에 알던 것만")을 지키려고, 반드시 매수일(anchor)
// 까지의 캔들만 받는다. 호출부(lib/prediction-outcome-store.ts)가 과거
// 예측을 소급해서 계산할 때도 candles.slice(0, anchorIndex + 1)로 잘라서
// 넘기므로 5일 뒤 정보가 섞일 수 없다. 순수 함수만 있는 파일.

export type FeatureCandle = { date: string; open: number; high: number; low: number; close: number; volume: number };

export type EntryFeatures = {
  volumeRatioPct: number | null; // 최근 5거래일 평균 거래량이 직전 20거래일 평균 대비 몇 % 늘었는지(lib/candidate-detail.ts buildVolumeNote와 동일 정의)
  change1dPct: number | null; // 매수일 하루 등락률
  change3dPct: number | null; // 3거래일 전 종가 대비
  change5dPct: number | null; // 5거래일 전 종가 대비
  limitUpStreak: number; // 매수일까지 연속으로 상한가급(하루 +29% 이상)이었던 일수
  rsi14: number | null;
  aboveMa5: boolean | null;
  aboveMa20: boolean | null;
  maAligned: boolean | null; // 5일선 > 20일선 > 60일선(정배열)
  distToHigh20Pct: number | null; // 20거래일 고점까지 남은 거리(%, 이미 고점이면 0)
  overheatScore: number; // 0~ (GPT 설계 27번 — 높을수록 과열)
  overheatReasons: string[];
};

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (gain === 0 && loss === 0) return 50;
  if (loss === 0) return 100;
  const rs = gain / period / (loss / period);
  return 100 - 100 / (1 + rs);
}

const LIMIT_UP_PCT = 29;

// 과열 점수 — 프리티(거래량 +4945%, 2일 연속 상한가 → -43%) 같은 사례를
// 걸러내려고 GPT가 제안한 가점표를 그대로 옮기되, 각 항목은 "실제 후보
// 풀에서 이 조건이 얼마나 자주 걸리는지"를 소급 데이터로 확인하고
// 조정할 수 있게 상수로 분리했다.
export const OVERHEAT_RULES = {
  volumeSpike1000: 20, // 거래량 1000%↑
  volumeSpike3000: 30, // 거래량 3000%↑ (1000%와 중복가산 안 함)
  surge3d20: 20, // 3거래일 +20%↑
  surge5d30: 20, // 5거래일 +30%↑
  limitUpStreak2: 30, // 2일 이상 연속 상한가급
  limitUpStreak1: 10, // 1일 상한가급
  rsiOver80: 10,
  nearHigh: 10, // 20일 고점 1.5% 이내(저항 코앞)
} as const;

export function computeEntryFeatures(candlesUpToEntry: FeatureCandle[]): EntryFeatures {
  const candles = candlesUpToEntry;
  const closes = candles.map((c) => c.close);
  const n = candles.length;
  const last = n > 0 ? candles[n - 1] : null;

  const dayChange = (i: number): number | null =>
    i >= 1 && closes[i - 1] > 0 ? ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100 : null;
  const changeOver = (days: number): number | null =>
    n > days && closes[n - 1 - days] > 0 ? ((closes[n - 1] - closes[n - 1 - days]) / closes[n - 1 - days]) * 100 : null;

  // 거래량 비율 — buildVolumeNote와 같은 정의(최근 5일 vs 그 직전 20일)
  let volumeRatioPct: number | null = null;
  if (n >= 10) {
    const recent = candles.slice(-5);
    const baseline = candles.slice(0, -5).slice(-20);
    const recentAvg = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
    const baselineAvg = baseline.length ? baseline.reduce((s, c) => s + c.volume, 0) / baseline.length : 0;
    if (baselineAvg > 0) volumeRatioPct = ((recentAvg - baselineAvg) / baselineAvg) * 100;
  }

  let limitUpStreak = 0;
  for (let i = n - 1; i >= 1; i--) {
    const ch = dayChange(i);
    if (ch !== null && ch >= LIMIT_UP_PCT) limitUpStreak++;
    else break;
  }

  const s5 = sma(closes, 5);
  const s20 = sma(closes, 20);
  const s60 = sma(closes, 60);
  const price = last?.close ?? null;
  const window20 = candles.slice(-20);
  const high20 = window20.length ? Math.max(...window20.map((c) => c.high)) : null;
  const distToHigh20Pct = price && high20 ? Math.max(0, ((high20 - price) / price) * 100) : null;

  const change1dPct = dayChange(n - 1);
  const change3dPct = changeOver(3);
  const change5dPct = changeOver(5);
  const rsi14 = rsi(closes);

  let score = 0;
  const reasons: string[] = [];
  if (volumeRatioPct !== null && volumeRatioPct >= 3000) {
    score += OVERHEAT_RULES.volumeSpike3000;
    reasons.push(`거래량 ${Math.round(volumeRatioPct)}% 폭증`);
  } else if (volumeRatioPct !== null && volumeRatioPct >= 1000) {
    score += OVERHEAT_RULES.volumeSpike1000;
    reasons.push(`거래량 ${Math.round(volumeRatioPct)}% 급증`);
  }
  if (change3dPct !== null && change3dPct >= 20) {
    score += OVERHEAT_RULES.surge3d20;
    reasons.push(`3일 +${change3dPct.toFixed(0)}%`);
  }
  if (change5dPct !== null && change5dPct >= 30) {
    score += OVERHEAT_RULES.surge5d30;
    reasons.push(`5일 +${change5dPct.toFixed(0)}%`);
  }
  if (limitUpStreak >= 2) {
    score += OVERHEAT_RULES.limitUpStreak2;
    reasons.push(`${limitUpStreak}일 연속 상한가급`);
  } else if (limitUpStreak === 1) {
    score += OVERHEAT_RULES.limitUpStreak1;
    reasons.push("상한가급 급등");
  }
  if (rsi14 !== null && rsi14 > 80) {
    score += OVERHEAT_RULES.rsiOver80;
    reasons.push(`RSI ${rsi14.toFixed(0)}`);
  }
  if (distToHigh20Pct !== null && distToHigh20Pct < 1.5) {
    score += OVERHEAT_RULES.nearHigh;
    reasons.push("20일 고점 코앞");
  }

  return {
    volumeRatioPct,
    change1dPct,
    change3dPct,
    change5dPct,
    limitUpStreak,
    rsi14,
    aboveMa5: s5 !== null && price !== null ? price >= s5 : null,
    aboveMa20: s20 !== null && price !== null ? price >= s20 : null,
    maAligned: s5 !== null && s20 !== null && s60 !== null ? s5 > s20 && s20 > s60 : null,
    distToHigh20Pct,
    overheatScore: score,
    overheatReasons: reasons,
  };
}

// 추천 제외(No-Trade) 판정 — 점수로 "억지 추천"하지 않고 위험한 패턴은 아예
// 빼는 필터(GPT 28번). 다만 조건을 넓게 잡으면 오히려 좋은 종목을 버린다는 걸
// 소급 검증(2026-09-25, 판정 가능 70건)에서 확인했다: "5일 +40%↑ 제외"를
// 과거에 대입하면 프리티(-43%)뿐 아니라 KS인더스트리(+48%)·현대약품(+26%)
// 같은 큰 승자도 같이 걸러졌다. 과열 신호가 한두 개 걸린 정도로는 승패가
// 갈리지 않았고(표본 30건 미만), 프리티는 손절 규칙 덕에 실현 손실이 -7.3%로
// 제한돼 종가 기준 -43%만큼 실제로 아프지도 않았다. 그래서 하드 제외는
// 여러 위험 신호가 동시에 극단적으로 겹치는 경우(프리티급, 점수 80↑)로만
// 좁히고, 그 아래는 과열 점수를 카드에 보여주고 결과와 함께 계속 쌓아서
// 표본이 충분해지면(과열군 30건+) 그때 임계값을 데이터로 다시 정한다.
export const NO_TRADE_OVERHEAT_SCORE = 80;

export function noTradeReason(f: EntryFeatures): string | null {
  if (f.overheatScore >= NO_TRADE_OVERHEAT_SCORE) {
    return `과열 점수 ${f.overheatScore} — ${f.overheatReasons.join(", ")}`;
  }
  return null;
}
