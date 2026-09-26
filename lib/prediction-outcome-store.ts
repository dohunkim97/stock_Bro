// 5거래일 창이 끝난 예상종목의 결과를 계산해서 PredictionOutcome에 "한 번만"
// 굳혀 저장한다(멱등 — 이미 있는 (forDate, code)는 건너뜀). 판정 자체는
// lib/prediction-outcome.ts의 순수 함수, 추천 시점 수치는
// lib/prediction-features.ts. 여기는 그 둘에 KIS 일봉을 먹여주고 DB에
// 넣는 얇은 서버 쪽 접착제다.
//
// 이 모듈은 lib/prediction-scoring.ts를 import하지 않는다(그쪽이 이 모듈을
// 가져다 쓰므로 순환 방지) — 후보/details JSON 파싱은 여기서 최소한만 한다.

import { prisma } from "@/lib/prisma";
import { fetchKisChart, type ChartCandle } from "@/lib/kis-chart";
import { todayISO } from "@/lib/dates";
import { resolveOutcome, OUTCOME_WINDOW_DAYS } from "@/lib/prediction-outcome";
import { computeEntryFeatures } from "@/lib/prediction-features";

// KIS 일봉은 동시 요청이 몰리면 실존 종목도 빈 배열이 돌아오는 경우가
// 있어(lib/prediction-scoring.ts 주석에 실측 기록) 한 번 재시도한다.
const EMPTY_CHART_RETRY_DELAY_MS = 1500;
const CHART_FETCH_CONCURRENCY = 3;

export async function fetchChartWithRetry(code: string): Promise<ChartCandle[]> {
  const first = await fetchKisChart(code, "D");
  if (first.length > 0) return first;
  await new Promise((resolve) => setTimeout(resolve, EMPTY_CHART_RETRY_DELAY_MS));
  return fetchKisChart(code, "D");
}

type RawItem = Record<string, unknown>;

type StoredDetail = {
  targetPrice: number | null;
  stopPrice: number | null;
  entryPrice: number | null;
  verdicts: unknown;
};

function parseDetails(raw: string | null | undefined): Map<string, StoredDetail> {
  const map = new Map<string, StoredDetail>();
  if (!raw) return map;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return map;
    for (const item of parsed as RawItem[]) {
      const name = item?.name;
      const strategy = item?.strategy as RawItem | undefined;
      if (typeof name !== "string") continue;
      const num = (v: unknown) => (typeof v === "number" ? v : null);
      map.set(name, {
        targetPrice: strategy ? num(strategy.targetPrice) : null,
        stopPrice: strategy ? num(strategy.stopLossPrice) : null,
        entryPrice: strategy ? num(strategy.entryPrice) : null,
        verdicts: item?.verdicts ?? null,
      });
    }
  } catch {
    // 형식이 어긋난 옛 레코드 — 목표/손절 없이 UNRATED로 처리된다
  }
  return map;
}

function parseCandidates(raw: string): { name: string; code?: string }[] {
  try {
    const p: unknown = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return (p as RawItem[])
      .filter((c) => typeof c?.name === "string")
      .map((c) => ({ name: c.name as string, code: typeof c.code === "string" ? (c.code as string) : undefined }));
  } catch {
    return [];
  }
}

export type ResolveSummary = { resolved: number; alreadyDone: number; notYetComplete: number; noChart: number };

// forDates를 주면 그 날짜의 예측만 대상으로(백필/부분 재시도용), 안 주면
// 오늘 이전 전부. 창이 아직 안 끝난 예측(매수 다음날부터 5거래일 캔들이
// 다 없음)은 건너뛰고 다음 실행 때 다시 시도한다.
export async function resolvePendingOutcomes(opts: { forDates?: string[] } = {}): Promise<ResolveSummary> {
  const rows = await prisma.weeklyPrediction.findMany({
    where: opts.forDates ? { forDate: { in: opts.forDates } } : { forDate: { lt: todayISO() } },
    orderBy: { forDate: "asc" },
  });
  const existing = await prisma.predictionOutcome.findMany({ select: { forDate: true, code: true } });
  const done = new Set(existing.map((e) => `${e.forDate}:${e.code}`));

  const summary: ResolveSummary = { resolved: 0, alreadyDone: 0, notYetComplete: 0, noChart: 0 };

  const tasks: { forDate: string; name: string; code: string; detail?: StoredDetail }[] = [];
  for (const row of rows) {
    const details = parseDetails(row.details);
    for (const c of parseCandidates(row.candidates)) {
      if (!c.code) continue;
      if (done.has(`${row.forDate}:${c.code}`)) {
        summary.alreadyDone++;
        continue;
      }
      tasks.push({ forDate: row.forDate, name: c.name, code: c.code, detail: details.get(c.name) });
    }
  }

  // 같은 종목이 여러 날 추천된 경우 차트를 한 번만 받는다(KIS 호출 절약)
  const chartByCode = new Map<string, ChartCandle[]>();
  const codes = [...new Set(tasks.map((t) => t.code))];
  for (let i = 0; i < codes.length; i += CHART_FETCH_CONCURRENCY) {
    await Promise.all(
      codes.slice(i, i + CHART_FETCH_CONCURRENCY).map(async (code) => {
        chartByCode.set(code, await fetchChartWithRetry(code));
      })
    );
  }

  for (const t of tasks) {
    const candles = chartByCode.get(t.code) ?? [];
    if (candles.length === 0) {
      summary.noChart++;
      continue;
    }
    // 매수일(anchor) = forDate 이후 첫 거래일 캔들. tracking(getDailyChangeSeries)
    // 과 같은 규칙이라 화면의 일차 칩과 판정이 같은 기준가/같은 날짜를 본다.
    const anchorIdx = candles.findIndex((c) => c.date >= t.forDate);
    if (anchorIdx === -1) {
      summary.notYetComplete++;
      continue;
    }
    const window = candles.slice(anchorIdx + 1, anchorIdx + 1 + OUTCOME_WINDOW_DAYS);
    if (window.length < OUTCOME_WINDOW_DAYS) {
      summary.notYetComplete++;
      continue;
    }

    // 기준가: 저장돼 있으면 그때 목표/손절을 계산한 바로 그 매수 기준가(strategy.
    // entryPrice), 옛 레코드는 anchor 종가(candidate-detail.ts anchorPrice와 동일).
    const entryPrice = t.detail?.entryPrice ?? candles[anchorIdx].close;
    const result = resolveOutcome({
      entryPrice,
      targetPrice: t.detail?.targetPrice ?? null,
      stopPrice: t.detail?.stopPrice ?? null,
      window,
    });
    if (!result) {
      summary.notYetComplete++;
      continue;
    }

    // 추천 시점 수치 — 반드시 anchor까지의 캔들만(사후정보 차단)
    const features = computeEntryFeatures(candles.slice(0, anchorIdx + 1));

    await prisma.predictionOutcome.upsert({
      where: { forDate_code: { forDate: t.forDate, code: t.code } },
      create: {
        forDate: t.forDate,
        code: t.code,
        name: t.name,
        entryPrice,
        targetPrice: t.detail?.targetPrice ?? null,
        stopPrice: t.detail?.stopPrice ?? null,
        outcome: result.outcome,
        exitDay: result.exitDay,
        exitPrice: result.exitPrice,
        realizedPct: result.realizedPct,
        closePct: result.closePct,
        targetTouchDay: result.targetTouchDay,
        stopTouchDay: result.stopTouchDay,
        mfePct: result.mfePct,
        maePct: result.maePct,
        features: JSON.stringify(features),
        verdicts: t.detail?.verdicts ? JSON.stringify(t.detail.verdicts) : null,
      },
      update: {}, // 이미 굳어진 결과는 건드리지 않는다
    });
    summary.resolved++;
  }

  return summary;
}
