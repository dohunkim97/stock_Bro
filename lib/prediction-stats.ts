// PredictionOutcome 행들로 주간/월간 리포트의 숫자를 만든다 — 전부 순수 계산
// (LLM 없음, prisma 없음)이라 서버/클라이언트 어디서든 쓸 수 있고, 리포트에
// 나오는 모든 수치가 같은 정의를 쓰게 한 곳에 모았다. 핵심 정의:
//  - 판정 가능(rated) = 추천 당시 목표가/손절가가 저장돼 있어 TARGET/STOP/
//    TIMEOUT/AMBIGUOUS로 가를 수 있는 건. 옛 기록(UNRATED)은 목표/손절
//    비율에서 빼고 "5일 종가 수익률" 통계에만 넣는다.
//  - 실현수익(realizedPct) = 목표/손절에 먼저 닿으면 그 가격, 아니면 5일차
//    종가로 청산했다고 본 수익률. 5일 종가 수익률(closePct)과 다른 질문이다.

import type { OutcomeKind } from "@/lib/prediction-outcome";
import type { EntryFeatures } from "@/lib/prediction-features";

export type OutcomeRow = {
  forDate: string;
  code: string;
  name: string;
  entryPrice: number;
  targetPrice: number | null;
  stopPrice: number | null;
  outcome: OutcomeKind;
  exitDay: number | null;
  realizedPct: number | null;
  closePct: number | null;
  targetTouchDay: number | null;
  stopTouchDay: number | null;
  mfePct: number | null;
  maePct: number | null;
  features: EntryFeatures | null;
  verdicts: Record<string, boolean | null> | null;
};

// 표본 크기에 따른 신뢰도 표시 — GPT 피드백(10/30/50/100건 단위)을 참고하되,
// 이 서비스는 하루 최대 5건이라 100건 이상 쌓이려면 몇 주가 걸린다는 현실에
// 맞춰 4단계로 단순화했다. "3건 다 성공했으니 강력한 패턴"이라는 착시를
// 막는 게 목적.
export type Confidence = "표본 부족" | "신뢰도 낮음" | "신뢰도 중간" | "신뢰도 높음";
export function confidenceFor(n: number): Confidence {
  if (n < 10) return "표본 부족";
  if (n < 30) return "신뢰도 낮음";
  if (n < 100) return "신뢰도 중간";
  return "신뢰도 높음";
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type SummaryStats = {
  total: number; // 전체 예측 수(UNRATED 포함)
  rated: number; // 목표/손절 판정 가능한 수
  unrated: number;
  target: number;
  stop: number;
  timeout: number;
  ambiguous: number;
  targetRate: number | null; // 아래 비율은 모두 rated 기준(0~100)
  stopRate: number | null;
  timeoutRate: number | null;
  ambiguousRate: number | null;
  closeUp: number; // 5일 종가가 플러스로 마감한 건(UNRATED 포함) — 목표/손절 판정과 별개의 참고 지표
  closeDown: number;
  avgClosePct: number | null; // 전체(UNRATED 포함) 5일 종가 수익률
  medianClosePct: number | null;
  bestClosePct: number | null;
  worstClosePct: number | null;
  avgRealizedPct: number | null; // rated 기준 실현수익 평균 = 가상 포트폴리오(종목당 동일금액) 수익률
  medianRealizedPct: number | null;
  worstRealizedPct: number | null;
  virtualPnlPerMillion: number | null; // 종목당 100만원씩 넣었다면 합계 손익(원)
  avgTargetPct: number | null; // 평균 목표 수익률(매수가 대비)
  avgStopPct: number | null; // 평균 손절률(음수)
  rewardRisk: number | null; // 손익비 = 평균 목표 / |평균 손절|
  breakevenTargetRate: number | null; // 손익분기 목표도달률(%, 기간종료 제외 단순화) = 1/(1+손익비)
};

export function summarize(rows: OutcomeRow[]): SummaryStats {
  const rated = rows.filter((r) => r.outcome !== "UNRATED");
  const count = (k: OutcomeKind) => rated.filter((r) => r.outcome === k).length;
  const rate = (n: number) => (rated.length ? (n / rated.length) * 100 : null);

  const closes = rows.map((r) => r.closePct).filter((v): v is number => v !== null);
  const realized = rated.map((r) => r.realizedPct).filter((v): v is number => v !== null);
  const targetPcts = rated
    .filter((r) => r.targetPrice !== null && r.entryPrice > 0)
    .map((r) => ((r.targetPrice! - r.entryPrice) / r.entryPrice) * 100);
  const stopPcts = rated
    .filter((r) => r.stopPrice !== null && r.entryPrice > 0)
    .map((r) => ((r.stopPrice! - r.entryPrice) / r.entryPrice) * 100);
  const avgTarget = mean(targetPcts);
  const avgStop = mean(stopPcts);
  const rr = avgTarget !== null && avgStop !== null && avgStop < 0 ? avgTarget / Math.abs(avgStop) : null;

  return {
    total: rows.length,
    rated: rated.length,
    unrated: rows.length - rated.length,
    target: count("TARGET"),
    stop: count("STOP"),
    timeout: count("TIMEOUT"),
    ambiguous: count("AMBIGUOUS"),
    targetRate: rate(count("TARGET")),
    stopRate: rate(count("STOP")),
    timeoutRate: rate(count("TIMEOUT")),
    ambiguousRate: rate(count("AMBIGUOUS")),
    closeUp: closes.filter((v) => v > 0).length,
    closeDown: closes.filter((v) => v <= 0).length,
    avgClosePct: mean(closes),
    medianClosePct: median(closes),
    bestClosePct: closes.length ? Math.max(...closes) : null,
    worstClosePct: closes.length ? Math.min(...closes) : null,
    avgRealizedPct: mean(realized),
    medianRealizedPct: median(realized),
    worstRealizedPct: realized.length ? Math.min(...realized) : null,
    virtualPnlPerMillion: realized.length ? realized.reduce((s, v) => s + v, 0) * 10_000 : null,
    avgTargetPct: avgTarget,
    avgStopPct: avgStop,
    rewardRisk: rr,
    breakevenTargetRate: rr !== null ? 100 / (1 + rr) : null,
  };
}

// ---------- 종목별 그룹 (같은 종목이 여러 번 추천된 경우 하나로 묶어서) ----------

export type StockGroup = {
  code: string;
  name: string;
  predictions: number;
  target: number;
  stop: number;
  timeout: number;
  ambiguous: number;
  unrated: number;
  avgClosePct: number | null;
  avgRealizedPct: number | null;
  worstRealizedPct: number | null;
  entries: OutcomeRow[]; // 날짜순 세부 예측
};

export function groupByStock(rows: OutcomeRow[]): StockGroup[] {
  const map = new Map<string, OutcomeRow[]>();
  for (const r of rows) {
    const list = map.get(r.code) ?? [];
    list.push(r);
    map.set(r.code, list);
  }
  const groups: StockGroup[] = [...map.entries()].map(([code, list]) => {
    const entries = [...list].sort((a, b) => a.forDate.localeCompare(b.forDate));
    const realized = entries.map((e) => e.realizedPct).filter((v): v is number => v !== null);
    const closes = entries.map((e) => e.closePct).filter((v): v is number => v !== null);
    const c = (k: OutcomeKind) => entries.filter((e) => e.outcome === k).length;
    return {
      code,
      name: entries[0].name,
      predictions: entries.length,
      target: c("TARGET"),
      stop: c("STOP"),
      timeout: c("TIMEOUT"),
      ambiguous: c("AMBIGUOUS"),
      unrated: c("UNRATED"),
      avgClosePct: mean(closes),
      avgRealizedPct: mean(realized),
      worstRealizedPct: realized.length ? Math.min(...realized) : null,
      entries,
    };
  });
  // 여러 번 추천된 종목이 위로(반복 성공/실패를 한눈에), 그다음 실현수익 순
  return groups.sort((a, b) => b.predictions - a.predictions || (b.avgRealizedPct ?? -999) - (a.avgRealizedPct ?? -999));
}

// ---------- 조건별 성과 ----------

export type ConditionStat = {
  label: string;
  n: number; // 해당 조건이면서 판정 가능한 건수
  target: number;
  stop: number;
  timeout: number;
  ambiguous: number;
  targetRate: number | null;
  stopRate: number | null;
  avgRealizedPct: number | null;
  confidence: Confidence;
};

export function conditionStat(label: string, rows: OutcomeRow[]): ConditionStat {
  const rated = rows.filter((r) => r.outcome !== "UNRATED");
  const c = (k: OutcomeKind) => rated.filter((r) => r.outcome === k).length;
  const realized = rated.map((r) => r.realizedPct).filter((v): v is number => v !== null);
  return {
    label,
    n: rated.length,
    target: c("TARGET"),
    stop: c("STOP"),
    timeout: c("TIMEOUT"),
    ambiguous: c("AMBIGUOUS"),
    targetRate: rated.length ? (c("TARGET") / rated.length) * 100 : null,
    stopRate: rated.length ? (c("STOP") / rated.length) * 100 : null,
    avgRealizedPct: mean(realized),
    confidence: confidenceFor(rated.length),
  };
}

const VERDICT_LABEL: Record<string, string> = {
  marketContext: "시황",
  volume: "거래량",
  chart: "차트",
  material: "재료",
  supplyDemand: "수급",
  financial: "재무",
};

// 항목별 O/X 조건 — "그 항목이 O(우호적)였던 예측"과 "X였던 예측"이 실제로
// 어떻게 끝났는지. 예전 categoryStats는 5일 종가 평균만 봤는데, 목표/손절
// 어느 쪽으로 끝났는지가 더 직접적인 답이라 이 정의로 바꿨다.
export type VerdictStat = { key: string; label: string; positive: ConditionStat; negative: ConditionStat; comparable: boolean };

// comparable — O와 X 양쪽 표본이 모두 10건 이상일 때만 "이 신호가 결과를 갈랐나"를
// 비교할 수 있다. 한쪽이 전체의 대부분(예: 시황 O가 95%)이면 그 조건의 성과는
// 그냥 전체 평균과 같은 얘기라서, 비교 불가로 표시해 교훈 근거로 못 쓰게 한다.
export function verdictConditionStats(rows: OutcomeRow[]): VerdictStat[] {
  return Object.entries(VERDICT_LABEL).map(([key, label]) => {
    const positive = conditionStat(`${label} O`, rows.filter((r) => r.verdicts?.[key] === true));
    const negative = conditionStat(`${label} X`, rows.filter((r) => r.verdicts?.[key] === false));
    return { key, label, positive, negative, comparable: positive.n >= 10 && negative.n >= 10 };
  });
}

// 비교의 기준선 — 조건 없이 전체를 본 성과
export function baselineStat(rows: OutcomeRow[]): ConditionStat {
  return conditionStat("전체 평균 (기준선)", rows);
}

function okCount(r: OutcomeRow): number {
  return r.verdicts ? Object.values(r.verdicts).filter((v) => v === true).length : 0;
}

// 추천 시점 수치(features) 기반 조건들 + 복합 조건 — 전부 "그때 알던 것"만 씀.
export function featureConditionStats(rows: OutcomeRow[]): ConditionStat[] {
  const f = (r: OutcomeRow) => r.features;
  return [
    conditionStat("과열 점수 0 (평온)", rows.filter((r) => (f(r)?.overheatScore ?? 0) === 0)),
    conditionStat("과열 점수 1~39", rows.filter((r) => { const s = f(r)?.overheatScore ?? 0; return s >= 1 && s < 40; })),
    conditionStat("과열 점수 40 이상", rows.filter((r) => (f(r)?.overheatScore ?? 0) >= 40)),
    conditionStat("거래량 300% 미만", rows.filter((r) => (f(r)?.volumeRatioPct ?? 0) < 300)),
    conditionStat("거래량 300~1500%", rows.filter((r) => { const v = f(r)?.volumeRatioPct ?? 0; return v >= 300 && v < 1500; })),
    conditionStat("거래량 1500% 이상", rows.filter((r) => (f(r)?.volumeRatioPct ?? 0) >= 1500)),
    conditionStat("이평선 정배열", rows.filter((r) => f(r)?.maAligned === true)),
    conditionStat("이평선 비정배열", rows.filter((r) => f(r)?.maAligned === false)),
    conditionStat("5일 급등 +30% 이상", rows.filter((r) => (f(r)?.change5dPct ?? 0) >= 30)),
    conditionStat("O 신호 5~6개", rows.filter((r) => okCount(r) >= 5)),
    conditionStat("O 신호 3~4개", rows.filter((r) => okCount(r) >= 3 && okCount(r) <= 4)),
    conditionStat("O 신호 0~2개", rows.filter((r) => okCount(r) <= 2)),
    conditionStat(
      "수급+거래량+차트 모두 O",
      rows.filter((r) => r.verdicts?.supplyDemand === true && r.verdicts?.volume === true && r.verdicts?.chart === true)
    ),
  ];
}
