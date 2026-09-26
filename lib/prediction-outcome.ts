// 예상종목 5거래일 결과 판정 — "최종 수익률"과 "목표/손절 중 뭐가 먼저였나"를
// 분리한다. 예전엔 hit=(5일 종가>0), hitTarget/hitStop=종가 기준 독립 불리언이라
// 순서 정보가 없어서 "+2.48%인데 손절"처럼 사람이 읽기에 모순으로 보이는
// 표기가 나왔다(각각은 사실이지만 서로 다른 질문의 답이었다). 여기서는
// 장중 고가/저가로 목표·손절 터치를 보고, 매수 다음 거래일(1일차)부터 5일
// 동안 "먼저 닿은 쪽"으로 결과를 정한다.
//
// prisma/외부 의존 없는 순수 함수만 둔다(테스트하기 쉽고 서버/클라이언트
// 어디서든 import 가능).

export type OutcomeKind = "TARGET" | "STOP" | "TIMEOUT" | "AMBIGUOUS" | "UNRATED";

export type WindowCandle = { date: string; open: number; high: number; low: number; close: number };

export type OutcomeResult = {
  outcome: OutcomeKind;
  exitDay: number | null; // 청산(판정)된 거래일차. TIMEOUT이면 5
  exitPrice: number | null;
  realizedPct: number | null; // 청산가 기준 실현 수익률(매수가 대비). 가상 포트폴리오 계산에 씀
  closePct: number | null; // 5일차 종가 기준 수익률 — "5일 뒤 그냥 들고 있었다면"
  targetTouchDay: number | null; // 처음 목표가에 닿은 거래일차(결과와 무관하게 기록)
  stopTouchDay: number | null; // 처음 손절가에 닿은 거래일차
  mfePct: number | null; // 5일 구간 최대 유리 이동(고가 기준)
  maePct: number | null; // 5일 구간 최대 불리 이동(저가 기준, 음수)
};

export const OUTCOME_WINDOW_DAYS = 5;

function pct(from: number, to: number): number {
  return ((to - from) / from) * 100;
}

// window: 매수 다음 거래일부터 정확히 5개 캔들(그보다 적으면 아직 판정 불가라
// null). target/stop이 없으면(옛 레코드) 목표/손절 판정은 못 하고 UNRATED로
// 5일 종가 수익률·MFE/MAE만 채운다.
//
// 같은 날 저가≤손절가 이고 고가≥목표가 인 경우, 일봉만으로는 어느 쪽이
// 먼저였는지 알 수 없다 — 순서를 추측하지 않고 AMBIGUOUS로 두되, 가상
// 수익률은 보수적으로(손절 먼저였다고) 계산한다. 시가가 이미 손절가 아래/
// 목표가 위로 갭이면 그 시가가 첫 사건이라 시가에 체결된 걸로 본다.
export function resolveOutcome(params: {
  entryPrice: number;
  targetPrice: number | null;
  stopPrice: number | null;
  window: WindowCandle[];
}): OutcomeResult | null {
  const { entryPrice, targetPrice, stopPrice, window } = params;
  if (!(entryPrice > 0) || window.length < OUTCOME_WINDOW_DAYS) return null;
  const days = window.slice(0, OUTCOME_WINDOW_DAYS);

  const closePct = pct(entryPrice, days[days.length - 1].close);
  const mfePct = pct(entryPrice, Math.max(...days.map((c) => c.high)));
  const maePct = pct(entryPrice, Math.min(...days.map((c) => c.low)));

  const ratable =
    targetPrice !== null && stopPrice !== null && targetPrice > entryPrice && stopPrice < entryPrice && targetPrice > stopPrice;
  if (!ratable) {
    return {
      outcome: "UNRATED",
      exitDay: null,
      exitPrice: null,
      realizedPct: null,
      closePct,
      targetTouchDay: null,
      stopTouchDay: null,
      mfePct,
      maePct,
    };
  }

  let targetTouchDay: number | null = null;
  let stopTouchDay: number | null = null;
  let outcome: OutcomeKind | null = null;
  let exitDay: number | null = null;
  let exitPrice: number | null = null;

  days.forEach((c, i) => {
    const day = i + 1;
    const stopTouched = c.low <= stopPrice!;
    const targetTouched = c.high >= targetPrice!;
    if (stopTouched && stopTouchDay === null) stopTouchDay = day;
    if (targetTouched && targetTouchDay === null) targetTouchDay = day;
    if (outcome !== null) return; // 결과는 첫 사건으로 이미 정해짐 — 나머지 날은 터치일 기록만

    if (c.open <= stopPrice!) {
      outcome = "STOP";
      exitDay = day;
      exitPrice = c.open;
    } else if (c.open >= targetPrice!) {
      outcome = "TARGET";
      exitDay = day;
      exitPrice = c.open;
    } else if (stopTouched && targetTouched) {
      outcome = "AMBIGUOUS";
      exitDay = day;
      exitPrice = stopPrice!; // 보수적: 손절 먼저였다고 가정
    } else if (stopTouched) {
      outcome = "STOP";
      exitDay = day;
      exitPrice = stopPrice!;
    } else if (targetTouched) {
      outcome = "TARGET";
      exitDay = day;
      exitPrice = targetPrice!;
    }
  });

  if (outcome === null) {
    outcome = "TIMEOUT";
    exitDay = OUTCOME_WINDOW_DAYS;
    exitPrice = days[days.length - 1].close;
  }

  return {
    outcome,
    exitDay,
    exitPrice,
    realizedPct: pct(entryPrice, exitPrice!),
    closePct,
    targetTouchDay,
    stopTouchDay,
    mfePct,
    maePct,
  };
}

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  TARGET: "목표 도달",
  STOP: "손절",
  TIMEOUT: "기간 종료",
  AMBIGUOUS: "판정 불가",
  UNRATED: "목표/손절 없음",
};
