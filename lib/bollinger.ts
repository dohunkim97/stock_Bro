// 볼린저밴드 계산 — 사용자 요청(2026-10-21) "주도주 눌림목 전략"의 기초
// 모듈(Phase 1). 순수 함수(prisma/네트워크 의존 없음) — lib/technical-
// signals.ts와 같은 원칙으로, 서버·클라이언트(차트 컴포넌트) 어디서든
// import할 수 있다.
//
// 설정: 기준 일봉(D1), period=20, 표준편차 배수=2(사용자가 실제 쓰는 값).
// 표준편차는 20일 "모집단" 표준편차(ddof=0, n으로 나눔) — 사용자가 명시한
// 기준. 표본표준편차(n-1로 나눔, ddof=1)를 쓰는 차트 라이브러리도 있어서
// 값이 다르게 나오면 이 차이 때문일 수 있다(설정 자체가 다른 게 아님).

import type { ChartCandle } from "@/lib/kis-chart";

export type BollingerPoint = {
  date: string;
  close: number;
  middle: number; // SMA(period)
  upper: number;
  lower: number;
  percentB: number | null; // (종가-하단)/(상단-하단). 상단=하단(변동성 0)이면 null — "데이터 예외", 0으로 대체하지 않음
  bandWidthPct: number; // (상단-하단)/중심선 × 100
};

export type BollingerSlope = "상승" | "횡보" | "하락";

// 하단 밴드 이탈 → (아직 안 돌아왔으면 null) 재진입 — 가장 최근 사건 하나.
export type BandReentryEvent = {
  breachDate: string;
  reentryDate: string | null;
  daysToReentry: number | null; // 이탈일로부터 재진입까지 영업일 수
};

export type BollingerAnalysis = {
  period: number;
  stdDevMultiplier: number;
  series: BollingerPoint[]; // 계산 가능한 구간 전체(기간 부족한 앞부분은 제외)
  latest: BollingerPoint | null; // series가 비었으면(캔들이 period보다 적음) null — "데이터 부족"
  bandWidthPercentile: number | null; // 오늘 BandWidth가 이 종목 자신의 과거 분포에서 몇 분위인지(0=가장 좁음). series가 20개 미만이면 분포 판단이 무의미해 null
  squeeze: boolean; // bandWidthPercentile이 낮은 분위(≤20)
  slope: BollingerSlope | null;
  slopePct: number | null; // slopeLookback일 전 중심선 대비 변화율
  recentReentry: BandReentryEvent | null;
};

function populationStdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

const SLOPE_FLAT_THRESHOLD_PCT = 1; // 기울기 구간 변화율이 ±1% 안이면 "횡보"
const SQUEEZE_PERCENTILE = 20; // BandWidth 분위가 이 이하면 Squeeze

export function computeBollinger(
  candles: ChartCandle[],
  period = 20,
  stdDevMultiplier = 2,
  slopeLookback = 5
): BollingerAnalysis {
  const series: BollingerPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1).map((c) => c.close);
    const middle = window.reduce((a, b) => a + b, 0) / period;
    const sd = populationStdDev(window);
    const upper = middle + sd * stdDevMultiplier;
    const lower = middle - sd * stdDevMultiplier;
    const close = candles[i].close;
    const denom = upper - lower;
    const percentB = denom > 0 ? (close - lower) / denom : null;
    const bandWidthPct = middle > 0 ? (denom / middle) * 100 : 0;
    series.push({ date: candles[i].date, close, middle, upper, lower, percentB, bandWidthPct });
  }

  if (series.length === 0) {
    return { period, stdDevMultiplier, series, latest: null, bandWidthPercentile: null, squeeze: false, slope: null, slopePct: null, recentReentry: null };
  }

  const latest = series[series.length - 1];

  // 분포 기준 Squeeze 판정 — 과거 자기 자신의 BandWidth들 중 지금이 몇
  // 번째로 좁은지를 분위로 — 종목마다 평소 변동성이 달라서 고정 숫자
  // 기준(예: "BandWidth 5% 이하")보다 상대적 기준이 더 공정하다(사용자
  // 요청 3-B 그대로).
  let bandWidthPercentile: number | null = null;
  if (series.length >= 20) {
    const sorted = [...series].map((p) => p.bandWidthPct).sort((a, b) => a - b);
    const rank = sorted.findIndex((v) => v >= latest.bandWidthPct);
    bandWidthPercentile = (rank / (sorted.length - 1)) * 100;
  }
  const squeeze = bandWidthPercentile !== null && bandWidthPercentile <= SQUEEZE_PERCENTILE;

  let slope: BollingerSlope | null = null;
  let slopePct: number | null = null;
  if (series.length > slopeLookback) {
    const past = series[series.length - 1 - slopeLookback].middle;
    slopePct = past > 0 ? ((latest.middle - past) / past) * 100 : null;
    if (slopePct !== null) {
      slope = slopePct >= SLOPE_FLAT_THRESHOLD_PCT ? "상승" : slopePct <= -SLOPE_FLAT_THRESHOLD_PCT ? "하락" : "횡보";
    }
  }

  // 가장 최근 "하단 이탈 → 재진입" 사건 하나만 — 최근부터 거슬러 올라가며
  // 종가가 하단 밴드 아래로 내려간 날을 찾고, 그 이후 처음 다시 하단 밴드
  // 안쪽(종가 ≥ 하단)으로 돌아온 날을 찾는다(사용자 요청 3-D: 이탈 즉시가
  // 아니라 재진입을 확인해야 더 높은 단계의 반등 후보).
  let recentReentry: BandReentryEvent | null = null;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].close < series[i].lower) {
      let reentryDate: string | null = null;
      let daysToReentry: number | null = null;
      for (let j = i + 1; j < series.length; j++) {
        if (series[j].close >= series[j].lower) {
          reentryDate = series[j].date;
          daysToReentry = j - i;
          break;
        }
      }
      recentReentry = { breachDate: series[i].date, reentryDate, daysToReentry };
      break;
    }
  }

  return { period, stdDevMultiplier, series, latest, bandWidthPercentile, squeeze, slope, slopePct, recentReentry };
}

// %B 구간 해석 — 사용자 요청 3-A 그대로. 이건 "기본 분석 구간"일 뿐 매수·
// 매도 확정 신호로 쓰지 않는다(호출부가 이 레이블만으로 판단하면 안 됨).
export type PercentBZone = "하단 이탈" | "하단 근접" | "밴드 내부" | "상단 근접" | "상단 이탈";

export function percentBZone(percentB: number): PercentBZone {
  if (percentB <= 0) return "하단 이탈";
  if (percentB <= 0.2) return "하단 근접";
  if (percentB < 0.8) return "밴드 내부";
  if (percentB < 1) return "상단 근접";
  return "상단 이탈";
}
