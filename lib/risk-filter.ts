// RiskFilter 모듈 (볼린저 Phase 2, 사용자 스펙 6단계 "추가해야 할 위험관리
// 기능") — 손절 기준(지지선 + ATR), 손익비, 과열 방지를 묶는다.
//
// 과열 점수는 새로 만들지 않고 lib/prediction-features.ts의 computeEntryFeatures
// /overheatScore/overheatReasons를 그대로 재사용한다 — "5일 급등·거래량
// 폭증·연속 상한가·RSI 과열"이 거기 이미 있고(실제 후보 데이터로 검증된
// 가중치), 같은 과열 판정을 이 전략에서 다르게 다시 만들면 두 기능이 같은
// 종목을 서로 다르게 "과열"이라 부르게 된다.
//
// 저항선은 lib/candidate-detail.ts의 buildChartNote를 그대로 재사용한다
// (20거래일 고점 — 기존 종목예상 카드와 완전히 같은 기준). 지지선은 거기
// 재사용하지 않는다 — buildChartNote.support는 "20일선(SMA20) 또는 20일
// 저점"인데, 이 전략은 정의상 가격이 밴드 하단(=SMA20보다 한참 아래)에
// 있을 때 쓰이므로 SMA20을 그대로 쓰면 지지선이 현재가보다 위에 찍히는
// 사고가 난다(실제로 테스트 스크립트에서 발견). 그래서 여기선 실제 최근
// 저점(swing low)만 지지선으로 쓰고, 그래도 현재가보다 위면 무시한다.
//
// 시장 전체 상태·업종 상태·포트폴리오 비중은 이 모듈이 알 수 없는 정보라
// (호출부가 Phase 3에서 채워야 함) 전달되지 않으면 "데이터 부족"으로만
// 표시하고 과열 없음으로 함부로 대체하지 않는다.

import type { ChartCandle } from "@/lib/kis-chart";
import { computeEntryFeatures, NO_TRADE_OVERHEAT_SCORE, type EntryFeatures } from "@/lib/prediction-features";
import { buildChartNote } from "@/lib/candidate-detail";

const ATR_PERIOD = 14;
const ATR_STOP_MULTIPLIER = 1.5;

function atr(candles: ChartCandle[], period = ATR_PERIOD): number | null {
  if (candles.length < period + 1) return null;
  const trueRanges: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    trueRanges.push(tr);
  }
  return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
}

// 전날 종가 대비 오늘 시가 갭 — 음수면 갭하락.
function latestGapPct(candles: ChartCandle[]): number | null {
  if (candles.length < 2) return null;
  const today = candles[candles.length - 1];
  const prevClose = candles[candles.length - 2].close;
  return prevClose > 0 ? ((today.open - prevClose) / prevClose) * 100 : null;
}

export type RiskAssessment = {
  entryPrice: number | null;
  support: number | null;
  resistance: number | null;
  atrValue: number | null;
  stopLossPrice: number | null; // 지지선과 (진입가 - ATR*1.5) 중 더 보수적인(높은) 쪽
  stopLossBasis: "지지선" | "ATR" | null;
  takeProfitPrice: number | null; // 저항선(실제 차트 고점) 그대로 — 인위적 하한 없음(기존 candidate-detail.ts 원칙과 동일)
  riskRewardRatio: number | null; // (익절가-진입가)/(진입가-손절가)
  gapDownPct: number | null;
  overheat: EntryFeatures;
  noTrade: boolean; // 과열 점수 극단적으로 높아 진입 자체를 피해야 하는 경우
  reasons: string[];
};

export function assessRisk(candles: ChartCandle[]): RiskAssessment {
  const closes = candles.map((c) => c.close);
  const entryPrice = closes.length > 0 ? closes[closes.length - 1] : null;
  const chart = buildChartNote(closes);
  const atrValue = atr(candles);
  const gapDownPct = latestGapPct(candles);
  const overheat = computeEntryFeatures(
    candles.map((c) => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))
  );

  const window = candles.slice(-20);
  const swingLow = window.length > 0 ? Math.min(...window.map((c) => c.low)) : null;
  const support = entryPrice !== null && swingLow !== null && swingLow < entryPrice ? swingLow : null;

  const reasons: string[] = [];
  let stopLossPrice: number | null = null;
  let stopLossBasis: "지지선" | "ATR" | null = null;

  if (entryPrice !== null) {
    const atrStop = atrValue !== null ? entryPrice - atrValue * ATR_STOP_MULTIPLIER : null;
    if (support !== null && atrStop !== null) {
      // 둘 중 진입가에 더 가까운(손실을 더 짧게 끊는) 쪽을 손절가로 — 지지선이
      // ATR 손절선보다 한참 아래라면 지지선까지 기다리다 손실이 커지므로.
      if (support >= atrStop) {
        stopLossPrice = support;
        stopLossBasis = "지지선";
      } else {
        stopLossPrice = atrStop;
        stopLossBasis = "ATR";
      }
    } else if (support !== null) {
      stopLossPrice = support;
      stopLossBasis = "지지선";
    } else if (atrStop !== null) {
      stopLossPrice = atrStop;
      stopLossBasis = "ATR";
    }
  }

  if (stopLossBasis) reasons.push(`손절가 ${stopLossBasis} 기준`);
  else reasons.push("지지선·ATR 모두 계산 불가 — 손절가 데이터 부족");

  if (gapDownPct !== null && gapDownPct <= -3) reasons.push(`전일 종가 대비 ${gapDownPct.toFixed(1)}% 갭하락 발생`);

  const takeProfitPrice = chart.recentHigh;
  const riskRewardRatio =
    entryPrice !== null && takeProfitPrice !== null && stopLossPrice !== null && entryPrice > stopLossPrice
      ? (takeProfitPrice - entryPrice) / (entryPrice - stopLossPrice)
      : null;

  if (riskRewardRatio !== null) reasons.push(`손익비 ${riskRewardRatio.toFixed(2)}`);

  const noTrade = overheat.overheatScore >= NO_TRADE_OVERHEAT_SCORE;
  if (noTrade) reasons.push(`과열 점수 ${overheat.overheatScore} — ${overheat.overheatReasons.join(", ")}`);

  return {
    entryPrice,
    support,
    resistance: chart.recentHigh,
    atrValue,
    stopLossPrice,
    stopLossBasis,
    takeProfitPrice,
    riskRewardRatio,
    gapDownPct,
    overheat,
    noTrade,
    reasons,
  };
}
