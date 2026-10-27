// 둥지 "AI 골구 종목 진단"의 서버 쪽 — 보유종목의 시세·일봉·수급·재무를 가져와
// lib/holding-assessment.ts(순수 판정 엔진)에 먹이고, 결과를 하루 한 건씩
// PortfolioAssessment에 저장한다(이 저장이 "지난번엔 뭐라고 했는지" 이력의
// 원천). 판정 자체는 여기서 하지 않는다.

import { prisma } from "@/lib/prisma";
import { fetchKisQuote } from "@/lib/kis-quote";
import { fetchKisChart } from "@/lib/kis-chart";
import { fetchInvestorTrend } from "@/lib/kis-investor-trend";
import { fetchFinancialHistoryByCode } from "@/lib/krx-financials";
import { getPortfolioSettings, getHoldings } from "@/lib/portfolio";
import { todayISO, nowSeoulTimeLabel, marketSession, kstDateParts, type MarketSession } from "@/lib/dates";
import { buildPriceSnapshot, type PriceSnapshot } from "@/lib/holding-price";
import { computeChartDetail, computeFlowDetail, computeVolumeDetail, type HoldingDetail } from "@/lib/holding-detail";
import {
  aggregateHoldings,
  assessHolding,
  daysBetween,
  portfolioFlags,
  sortByPriority,
  stateFromSignals,
  type AssessmentState,
  type HoldingAssessment,
  type PortfolioFlag,
  type Signal,
} from "@/lib/holding-assessment";

const CONCURRENCY = 3; // KIS는 동시 요청이 몰리면 빈 응답이 오는 일이 있어(lib/prediction-scoring.ts 주석) 소량씩

export type StateChange = {
  fromState: AssessmentState;
  fromDate: string;
  reasons: string[]; // 두 날짜 사이에 점수가 달라진 신호들
};

// 바로 전 기록일(보통 전 거래일)과의 비교 — lastChange는 "상태가 마지막으로
// 달랐던 날"까지 거슬러 올라가서, 월요일에 악화된 뒤 같은 등급이 이어져도
// 화·수·목요일마다 계속 "악화"로 보였다(알림이 매일 반복된 원인). 알림은
// 이걸 써서 "어제와 비교해 오늘 실제로 바뀌었는지"만 본다.
export type PreviousDayComparison = {
  date: string;
  state: AssessmentState;
  totalScore: number | null; // 그날 신호 합계(저장된 신호로 다시 계산) — 알림 기록의 previous_risk_score
  reasons: string[]; // 점수가 바뀐 신호, 변화 폭이 큰 순
};

export type HoldingHistory = {
  code: string;
  entries: { date: string; state: AssessmentState }[]; // 최신순, 오늘 포함
  lastChange: StateChange | null;
  previousDay: PreviousDayComparison | null;
};

export type AssessmentReport = {
  date: string;
  asOf: string; // 이 판정이 실제로 계산된 시각(장중 가격이 계속 바뀌므로 date와 별개) — "데이터 기준 시각" 표시용
  session: MarketSession;
  assessments: HoldingAssessment[]; // 우선순위 정렬 완료
  prices: Record<string, PriceSnapshot>; // 종목코드별 오늘 등락(전일 종가 대비) — 평단 대비 손익과 별개
  details: Record<string, HoldingDetail>; // 종목코드별 차트·거래량·수급 상세(보여주기용, 등급엔 안 씀)
  flags: PortfolioFlag[];
  history: Record<string, HoldingHistory>;
  totalValuation: number;
};

async function fetchInputs(code: string) {
  const nowYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
  const [quote, candles, flows, financials] = await Promise.all([
    fetchKisQuote(code),
    fetchKisChart(code, "D"),
    // 30행(KIS가 한 번에 주는 최대치, 같은 1회 호출) — 상세의 20거래일 누적용.
    // 등급의 수급 신호는 여전히 앞의 5거래일만 본다(flowSignal의 slice(0, 5)).
    // skipUnreported: 장중에 빈 값으로 오는 오늘 행을 "순매수 0"으로 세지 않게.
    fetchInvestorTrend(code, 30, { skipUnreported: true }),
    fetchFinancialHistoryByCode(code, [nowYear - 3, nowYear - 2, nowYear - 1]),
  ]);
  return { quote, candles, flows, financials };
}

function parseSignals(raw: string): Signal[] {
  try {
    const p: unknown = JSON.parse(raw);
    return Array.isArray(p) ? (p as Signal[]) : [];
  } catch {
    return [];
  }
}

// 두 기록 사이 점수가 바뀐 신호 — 변화 폭이 큰 순(알림의 "핵심 원인 1~3개"가
// 앞에서부터 자르기만 하면 되게).
function changedSignals(nowRaw: string, prevRaw: string): string[] {
  const nowSignals = parseSignals(nowRaw);
  const prevSignals = parseSignals(prevRaw);
  const changed: { text: string; delta: number }[] = [];
  for (const n of nowSignals) {
    const p = prevSignals.find((s) => s.key === n.key);
    if (p && p.score !== n.score) {
      changed.push({ text: `${n.label}: ${n.note}`, delta: Math.abs((n.score ?? 0) - (p.score ?? 0)) });
    }
  }
  return changed.sort((a, b) => b.delta - a.delta).map((c) => c.text);
}

// 과거 기록의 등급을 "지금 규칙"으로 다시 매긴다 — 판정 규칙이 바뀌면(2026-10-27
// -50% 손실 가중 규칙 삭제) 저장된 state는 옛 규칙 결과라, 그대로 비교하면 시장은
// 그대로인데 "위험 감소"로 보이는 가짜 변화가 생긴다. 신호 점수는 그대로 저장돼
// 있어서 같은 규칙으로 다시 계산할 수 있다. DB의 기록 자체는 고치지 않는다.
// 신호를 못 읽는 옛 행이면 저장된 state를 그대로 쓴다.
function restate(r: { state: string; signals: string }): AssessmentState {
  const signals = parseSignals(r.signals);
  return signals.length > 0 ? stateFromSignals(signals).state : (r.state as AssessmentState);
}

function buildHistory(
  code: string,
  today: string,
  rawRows: { date: string; state: string; signals: string }[]
): HoldingHistory {
  const rows = rawRows.map((r) => ({ ...r, state: restate(r) }));
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const entries = sorted.slice(0, 8).map((r) => ({ date: r.date, state: r.state as AssessmentState }));

  let lastChange: StateChange | null = null;
  let previousDay: PreviousDayComparison | null = null;
  const current = sorted.find((r) => r.date === today) ?? sorted[0];
  if (current) {
    const older = sorted.filter((r) => r.date < current.date);
    // 상태가 실제로 달라진 가장 최근 시점을 찾는다 — 같은 상태가 며칠 이어졌으면 그 앞의 다른 상태까지 거슬러 올라감
    const prev = older.find((r) => r.state !== current.state);
    if (prev) {
      lastChange = { fromState: prev.state as AssessmentState, fromDate: prev.date, reasons: changedSignals(current.signals, prev.signals) };
    }
    const yesterday = older[0];
    if (yesterday) {
      const ySignals = parseSignals(yesterday.signals);
      previousDay = {
        date: yesterday.date,
        state: yesterday.state as AssessmentState,
        totalScore: ySignals.length > 0 ? stateFromSignals(ySignals).totalScore : null,
        reasons: changedSignals(current.signals, yesterday.signals),
      };
    }
  }
  return { code, entries, lastChange, previousDay };
}

async function build(userId: string): Promise<AssessmentReport> {
  const date = todayISO();
  const session = marketSession();
  const [settings, rows] = await Promise.all([getPortfolioSettings(userId), getHoldings(userId)]);
  const aggregated = aggregateHoldings(rows);

  const inputsByCode = new Map<string, Awaited<ReturnType<typeof fetchInputs>>>();
  for (let i = 0; i < aggregated.length; i += CONCURRENCY) {
    await Promise.all(
      aggregated.slice(i, i + CONCURRENCY).map(async (h) => {
        inputsByCode.set(h.code, await fetchInputs(h.code));
      })
    );
  }

  const priced = aggregated
    .map((h) => {
      const inp = inputsByCode.get(h.code)!;
      const lastClose = inp.candles.length > 0 ? inp.candles[inp.candles.length - 1].close : null;
      const currentPrice = inp.quote?.price ?? lastClose;
      return currentPrice && currentPrice > 0 ? { h, inp, currentPrice } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const stockValuation = priced.reduce((s, x) => s + x.currentPrice * x.h.quantity, 0);
  const totalValuation = stockValuation + settings.cashAmount + settings.bondAmount + settings.altAssetAmount;

  const assessments = sortByPriority(
    priced.map(({ h, inp, currentPrice }) =>
      assessHolding({
        name: h.name,
        code: h.code,
        avgBuyPrice: h.avgBuyPrice,
        quantity: h.quantity,
        currentPrice,
        candles: inp.candles,
        flows: inp.flows,
        financials: inp.financials,
        portfolioValuation: totalValuation,
        firstBuyDate: h.firstBuyDate,
        holdingDays: h.firstBuyDate ? daysBetween(h.firstBuyDate, date) : null,
        lastCandlePartial: session === "장중" && inp.candles.length > 0 && inp.candles[inp.candles.length - 1].date === date,
      })
    )
  );

  const prices: Record<string, PriceSnapshot> = {};
  const details: Record<string, HoldingDetail> = {};
  const { hour, minute } = kstDateParts(new Date());
  const minutesSinceOpen = session === "장중" ? hour * 60 + minute - 9 * 60 : null;
  for (const { h, inp, currentPrice } of priced) {
    const snap = buildPriceSnapshot(inp.quote, inp.candles, session);
    if (snap) prices[h.code] = snap;
    const lastCandlePartial = session === "장중" && inp.candles.length > 0 && inp.candles[inp.candles.length - 1].date === date;
    details[h.code] = {
      chart: computeChartDetail(inp.candles, currentPrice),
      volume: computeVolumeDetail(inp.candles, { lastCandlePartial, quote: inp.quote, minutesSinceOpen }),
      flow: computeFlowDetail(inp.flows, inp.candles),
      financials: inp.financials,
    };
  }

  // 하루 한 행 — 오늘 다시 열면 덮어쓴다(가격이 장중에 바뀌므로 마지막 계산이 그날의 기록)
  await Promise.all(
    assessments.map((a) =>
      prisma.portfolioAssessment.upsert({
        where: { userId_code_date: { userId, code: a.code, date } },
        create: {
          userId,
          code: a.code,
          name: a.name,
          date,
          state: a.state,
          totalScore: a.totalScore,
          signals: JSON.stringify(a.signals),
          avgBuyPrice: a.avgBuyPrice,
          currentPrice: a.currentPrice,
          changePct: a.changePct,
          weightPct: a.weightPct,
          recoveryNeededPct: a.recoveryNeededPct,
        },
        update: {
          name: a.name,
          state: a.state,
          totalScore: a.totalScore,
          signals: JSON.stringify(a.signals),
          avgBuyPrice: a.avgBuyPrice,
          currentPrice: a.currentPrice,
          changePct: a.changePct,
          weightPct: a.weightPct,
          recoveryNeededPct: a.recoveryNeededPct,
        },
      })
    )
  );

  const codes = assessments.map((a) => a.code);
  const past = codes.length
    ? await prisma.portfolioAssessment.findMany({
        where: { userId, code: { in: codes } },
        select: { code: true, date: true, state: true, signals: true },
        orderBy: { date: "desc" },
        take: 400,
      })
    : [];
  const history: Record<string, HoldingHistory> = {};
  for (const code of codes) {
    history[code] = buildHistory(code, date, past.filter((p) => p.code === code));
  }

  const pct = (amount: number) => (totalValuation > 0 ? (amount / totalValuation) * 100 : 0);
  const cashPct = pct(settings.cashAmount);
  const flags =
    totalValuation > 0
      ? portfolioFlags({
          stockPct: pct(stockValuation),
          buffersPct: pct(settings.cashAmount + settings.bondAmount + settings.altAssetAmount),
          cashPct,
          holdings: assessments,
          stockValuation,
        })
      : [];

  return { date, asOf: nowSeoulTimeLabel(), session, assessments, prices, details, flags, history, totalValuation };
}

// 둥지 페이지가 열릴 때 진단 카드와 AI 어드바이저 카드가 동시에 이 함수를 부르는데,
// 시세·일봉·수급·재무를 종목마다 가져오는 무거운 계산이라 같은 사용자·같은 날
// 요청이 겹치면 한 번만 계산하고 결과를 나눠 쓴다(같은 서버 인스턴스 안에서만
// 유효 — 다른 인스턴스로 갈라지면 각자 계산하지만 결과는 upsert라 같다).
const inflight = new Map<string, Promise<AssessmentReport>>();

export function getAssessmentReport(userId: string): Promise<AssessmentReport> {
  const key = `${userId}:${todayISO()}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = build(userId).finally(() => {
    setTimeout(() => inflight.delete(key), 15_000); // 잠깐 캐시 — 어드바이저가 조금 늦게 와도 재계산 안 하게
  });
  inflight.set(key, p);
  return p;
}
