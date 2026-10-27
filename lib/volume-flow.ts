// VolumeFlow 모듈 (볼린저 Phase 2, 사용자 스펙 3단계 "거래량과 거래대금
// 확인") — "거래량 평균은 분석 당일을 제외한 직전 20거래일 기준"을 그대로
// 구현한다. lib/holding-assessment.ts의 TechMetrics.volumeRatio(최근 5일
// 평균 vs 그 직전 20일)와는 분모·분자 정의가 달라 재사용하지 않고 새로
// 계산한다 — 여긴 "오늘 하루"를 20일 평균과 직접 비교한다.
//
// "상승을 뒷받침하는 거래량인지, 고점 매물 거래량인지"는 상승일/하락일의
// 거래량을 직접 비교해서 가른다(지어내지 않고 실데이터로).

import type { ChartCandle } from "@/lib/kis-chart";

export type VolumeFlowEvaluation = "상승 지속 뒷받침" | "고점 매물성 거래량 의심" | "관심 이탈" | "평이함" | "데이터 부족";

export type VolumeFlowResult = {
  todayVolume: number | null;
  avgVolume20d: number | null; // 당일 제외 직전 20거래일 평균
  volumeMultiple: number | null; // todayVolume / avgVolume20d
  upDayVolumeAvg: number | null; // 최근 5거래일 중 상승일 평균 거래량
  downDayVolumeAvg: number | null; // 최근 5거래일 중 하락일 평균 거래량
  evaluation: VolumeFlowEvaluation;
  reasons: string[];
};

const BASELINE_DAYS = 20;
const RECENT_DAYS = 5;

export function evaluateVolumeFlow(candles: ChartCandle[]): VolumeFlowResult {
  if (candles.length < BASELINE_DAYS + 1) {
    return {
      todayVolume: null,
      avgVolume20d: null,
      volumeMultiple: null,
      upDayVolumeAvg: null,
      downDayVolumeAvg: null,
      evaluation: "데이터 부족",
      reasons: [`캔들이 ${BASELINE_DAYS + 1}개 미만 — 20거래일 평균을 산출할 수 없음`],
    };
  }

  const today = candles[candles.length - 1];
  const baseline = candles.slice(-(BASELINE_DAYS + 1), -1); // 당일 제외 직전 20거래일
  const avgVolume20d = baseline.reduce((s, c) => s + c.volume, 0) / baseline.length;
  const volumeMultiple = avgVolume20d > 0 ? today.volume / avgVolume20d : null;

  const recent = candles.slice(-RECENT_DAYS);
  const upDays: number[] = [];
  const downDays: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prevClose = recent[i - 1].close;
    if (prevClose <= 0) continue;
    if (recent[i].close > prevClose) upDays.push(recent[i].volume);
    else if (recent[i].close < prevClose) downDays.push(recent[i].volume);
  }
  const upDayVolumeAvg = upDays.length > 0 ? upDays.reduce((a, b) => a + b, 0) / upDays.length : null;
  const downDayVolumeAvg = downDays.length > 0 ? downDays.reduce((a, b) => a + b, 0) / downDays.length : null;

  const reasons: string[] = [];
  let evaluation: VolumeFlowEvaluation;

  const todayUp = candles.length >= 2 && today.close > candles[candles.length - 2].close;

  if (volumeMultiple === null) {
    evaluation = "데이터 부족";
    reasons.push("직전 20거래일 평균 거래량이 0 이하");
  } else if (volumeMultiple < 0.7) {
    evaluation = "관심 이탈";
    reasons.push(`오늘 거래량이 20일 평균의 ${(volumeMultiple * 100).toFixed(0)}% — 관심 축소`);
  } else if (todayUp && volumeMultiple >= 1.3 && (downDayVolumeAvg === null || (upDayVolumeAvg !== null && upDayVolumeAvg >= downDayVolumeAvg))) {
    evaluation = "상승 지속 뒷받침";
    reasons.push(`오늘 거래량 20일 평균의 ${(volumeMultiple * 100).toFixed(0)}%`, "상승일 거래량이 하락일보다 우위 — 매수세가 뒷받침");
  } else if (!todayUp && volumeMultiple >= 1.5) {
    evaluation = "고점 매물성 거래량 의심";
    reasons.push(`하락하면서 거래량이 20일 평균의 ${(volumeMultiple * 100).toFixed(0)}%로 급증 — 매물 출회 가능성`);
  } else {
    evaluation = "평이함";
    reasons.push(`오늘 거래량 20일 평균의 ${(volumeMultiple * 100).toFixed(0)}%`);
  }

  return { todayVolume: today.volume, avgVolume20d, volumeMultiple, upDayVolumeAvg, downDayVolumeAvg, evaluation, reasons };
}
