// PredictionOutcome(결과 DB)을 읽어오는 서버 쪽 조회 + "다음 종목 선정에 쓸
// 누적 학습 블록" 생성. GPT 피드백의 "자체 학습은 AI 재학습이 아니라 통계
// 업데이트가 먼저"를 그대로 따른다 — LLM이 지난주 결과를 보고 교훈을
// 지어내는 대신, 지금까지 쌓인 결과를 코드가 집계한 숫자(+표본 크기)를
// 그대로 프롬프트에 넣는다. 누적(전 기간)이라 한 주 결과에 휘둘리지 않는다.

import { prisma } from "@/lib/prisma";
import type { OutcomeKind } from "@/lib/prediction-outcome";
import {
  summarize,
  baselineStat,
  verdictConditionStats,
  featureConditionStats,
  type OutcomeRow,
  type ConditionStat,
} from "@/lib/prediction-stats";

type DbOutcome = Awaited<ReturnType<typeof prisma.predictionOutcome.findMany>>[number];

function toRow(r: DbOutcome): OutcomeRow {
  const parse = <T,>(s: string | null): T | null => {
    if (!s) return null;
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };
  return {
    forDate: r.forDate,
    code: r.code,
    name: r.name,
    entryPrice: r.entryPrice,
    targetPrice: r.targetPrice,
    stopPrice: r.stopPrice,
    outcome: r.outcome as OutcomeKind,
    exitDay: r.exitDay,
    realizedPct: r.realizedPct,
    closePct: r.closePct,
    targetTouchDay: r.targetTouchDay,
    stopTouchDay: r.stopTouchDay,
    mfePct: r.mfePct,
    maePct: r.maePct,
    features: parse(r.features),
    verdicts: parse(r.verdicts),
  };
}

// from/to는 forDate(추천일) 기준 양끝 포함. 안 주면 전체.
export async function loadOutcomeRows(opts: { from?: string; to?: string } = {}): Promise<OutcomeRow[]> {
  const rows = await prisma.predictionOutcome.findMany({
    where: { forDate: { gte: opts.from, lte: opts.to } },
    orderBy: [{ forDate: "asc" }, { code: "asc" }],
  });
  return rows.map(toRow);
}

const pct = (v: number | null, digits = 0) => (v === null ? "-" : `${v.toFixed(digits)}%`);
const signed = (v: number | null, digits = 1) => (v === null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`);

function conditionLine(c: ConditionStat): string {
  return `- ${c.label}: ${c.n}건 중 목표 ${c.target} / 손절 ${c.stop} / 기간종료 ${c.timeout}${c.ambiguous ? ` / 판정불가 ${c.ambiguous}` : ""}, 평균 실현 ${signed(c.avgRealizedPct)} (${c.confidence})`;
}

// 프롬프트용 블록(코드가 계산한 사실만). 표본 3건 미만 조건은 아예 안 싣고,
// 나머지는 표본 크기와 신뢰도를 같이 적어 LLM이 "3건 다 성공했으니 강력한
// 패턴" 같은 결론을 내지 못하게 한다.
export function learningBlockFromRows(rows: OutcomeRow[]): string {
  const s = summarize(rows);
  if (s.rated === 0) return "";

  const lines = [
    "[누적 예측 성과 — 5거래일 결과 확정 기준. 목표/손절은 장중 고가/저가로 '먼저 닿은 쪽'이며, 5일 종가 수익률과는 다른 개념]",
    `판정 가능 ${s.rated}건(전체 ${s.total}건): 목표 도달 ${pct(s.targetRate)} · 손절 ${pct(s.stopRate)} · 기간 종료 ${pct(s.timeoutRate)} · 판정불가 ${pct(s.ambiguousRate)}`,
    `평균 실현수익 ${signed(s.avgRealizedPct, 2)} (중앙값 ${signed(s.medianRealizedPct, 2)}, 최악 ${signed(s.worstRealizedPct, 2)}), 평균 목표 ${signed(s.avgTargetPct)} / 평균 손절 ${signed(s.avgStopPct)} → 손익비 ${s.rewardRisk?.toFixed(2) ?? "-"}, 손익분기 목표도달률 ${pct(s.breakevenTargetRate)}`,
  ];

  // 조건별 성과는 "전체 평균(기준선)"과 비교해야 의미가 있다 — 예: 시황 O가
  // 후보의 95%면 그 조건의 성과는 그냥 전체 평균과 같은 얘기고(기저율), O/X
  // 양쪽 표본이 10건 이상일 때만 신호가 결과를 갈랐는지 비교할 수 있다.
  const base = baselineStat(rows);
  const verdictLines = verdictConditionStats(rows).flatMap((v) =>
    [v.positive, v.negative]
      .filter((c) => c.n >= 3)
      .map((c) => `${conditionLine(c)}${v.comparable ? "" : " — 반대 조건 표본이 10건 미만이라 비교 불가(전체 평균과 같은 얘기)"}`)
  );
  const featureLines = featureConditionStats(rows)
    .filter((c) => c.n >= 3)
    .map(conditionLine);
  if (verdictLines.length + featureLines.length > 0) {
    lines.push(
      "[조건별 성과 — 반드시 '전체 평균(기준선)'과 비교해서 봐. 표본이 작거나 반대 조건과 비교가 안 되면 우연/기저율일 수 있어 결론 근거로 쓰지 마]",
      conditionLine(base),
      ...verdictLines,
      ...featureLines
    );
  }
  return lines.join("\n");
}

export async function cumulativeLearningBlock(): Promise<string> {
  return learningBlockFromRows(await loadOutcomeRows());
}

// 채팅 컨텍스트(lib/bro-context.ts)용 한 줄 요약
export function outcomeOneLiner(rows: OutcomeRow[]): string | null {
  const s = summarize(rows);
  if (s.rated === 0) return null;
  return `판정 ${s.rated}건: 목표 ${pct(s.targetRate)} / 손절 ${pct(s.stopRate)} / 기간종료 ${pct(s.timeoutRate)}, 평균 실현수익 ${signed(s.avgRealizedPct, 2)}`;
}
