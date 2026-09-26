// 기록보관소의 주간분석/월간분석 — 그 기간 예상종목의 5거래일 추적이 전부
// 끝난 뒤 딱 한 번 생성되는 리포트. 2026-09-25 개편(GPT 피드백 반영):
//
//  1) 숫자는 전부 PredictionOutcome(결과 DB)에서 코드가 집계한다 — 목표/손절
//     "먼저 닿은 쪽", 실현수익 vs 5일 종가 수익률, 손익비, 가상 포트폴리오,
//     조건별 성과(+표본 크기). LLM은 숫자를 만들지 않는다(lib/prediction-stats.ts).
//  2) LLM 호출을 둘로 나눴다. (a) 종목별 사후 해설 — 5일 뒤의 실제 뉴스를
//     써서 "왜 이렇게 끝났나"를 풀어주는 표시용 텍스트이고, (b) 총평/교훈 —
//     결과 통계(추천 당시 수치 + 확정된 결과)만 보고 쓴다. 사후 뉴스가
//     다음 종목 선정에 들어가는 교훈에 섞이지 않게(look-ahead 방지) 하는 게
//     이 분리의 목적이다.
//  3) 같은 종목이 여러 번 추천됐으면 하나로 묶어서(StockGroup) 보여준다.
//
// week/month는 스키마·생성 로직이 동일하고 기간 키 포맷만 다르다.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { fetchNews } from "@/lib/naver-news";
import { weekInfoFromDate, weekInfoFromKey } from "@/lib/week";
import { todayISO } from "@/lib/dates";
import { resolvePendingOutcomes } from "@/lib/prediction-outcome-store";
import { loadOutcomeRows, learningBlockFromRows } from "@/lib/prediction-learning";
import { OUTCOME_LABEL } from "@/lib/prediction-outcome";
import {
  summarize,
  groupByStock,
  verdictConditionStats,
  featureConditionStats,
  type SummaryStats,
  type StockGroup,
  type ConditionStat,
  type VerdictStat,
  type OutcomeRow,
} from "@/lib/prediction-stats";

export type PeriodType = "week" | "month";

export type StockExplanation = { code: string; name: string; text: string };

export type PeriodAnalysisData = {
  periodType: PeriodType;
  periodKey: string;
  label: string;
  startDate: string;
  endDate: string;
  summary: string;
  candidateHitRate: number | null; // = 목표 도달률(0~1). 옛 이름 유지(기록보관소 meta용) — 정의는 "목표가 먼저 닿은 비율(판정 가능 건 기준)"
  stats: SummaryStats;
  stockGroups: StockGroup[];
  verdictStats: VerdictStat[];
  featureStats: ConditionStat[];
  explanations: StockExplanation[];
  insights: string[];
};

function periodKeyFor(type: PeriodType, forDate: string): string {
  return type === "week" ? weekInfoFromDate(forDate).key : forDate.slice(0, 7);
}

function periodLabelFor(type: PeriodType, key: string): string {
  if (type === "week") return weekInfoFromKey(key).label;
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function periodRangeFor(type: PeriodType, key: string): { start: string; end: string } {
  if (type === "week") {
    const info = weekInfoFromKey(key);
    return { start: info.startISO, end: info.endISO };
  }
  const [y, m] = key.split("-").map(Number);
  return { start: `${key}-01`, end: `${key}-${String(daysInMonth(y, m)).padStart(2, "0")}` };
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// 사후 해설은 이 개수의 종목(묶음)까지만 — 월간은 후보가 100개 가까이 쌓일 수
// 있어 전부 물으면 프롬프트가 너무 커진다. 나머지는 통계에는 그대로 포함된다.
const MAX_EXPLAINED = 12;

function fmtPct(v: number | null, digits = 1): string {
  return v === null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function callLlm(system: string, user: string, maxTokens: number): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: user }],
    });
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  } catch {
    return null;
  }
}

// (a) 종목별 사후 해설 — 표시 전용. 5일 뒤 시점의 실제 뉴스를 쓰므로 여기서
// 나온 문장은 절대 다음 예측의 학습 입력으로 쓰지 않는다.
async function explainStocks(
  label: string,
  groups: StockGroup[],
  reasoningByKey: Map<string, string>
): Promise<StockExplanation[]> {
  const importance = (g: StockGroup) =>
    Math.max(Math.abs(g.avgClosePct ?? 0), Math.abs(g.avgRealizedPct ?? 0)) + (g.predictions - 1) * 5;
  const picked = [...groups].sort((a, b) => importance(b) - importance(a)).slice(0, MAX_EXPLAINED);
  if (picked.length === 0) return [];

  const news = new Map(await Promise.all(picked.map(async (g) => [g.code, await fetchNews(g.name, 3)] as const)));

  const blocks = picked
    .map((g) => {
      const entryLines = g.entries
        .map((e) => {
          const reasoning = reasoningByKey.get(`${e.forDate}|${e.code}`) ?? "";
          return `  · ${e.forDate.slice(5)} 추천 → ${OUTCOME_LABEL[e.outcome]}${e.exitDay ? `(${e.exitDay}일차)` : ""}, 실현 ${fmtPct(e.realizedPct)} / 5일 종가 ${fmtPct(e.closePct)} (당시 근거: "${reasoning.slice(0, 120)}")`;
        })
        .join("\n");
      const newsLine = (news.get(g.code) ?? []).map((n) => n.title).join(" / ") || "관련 뉴스 없음";
      return `- ${g.name}(${g.code}) 총 ${g.predictions}회 추천\n${entryLines}\n  최근 뉴스: ${newsLine}`;
    })
    .join("\n");

  const system = [
    '너는 "Golgoo"라는 개인 투자 AI야. 친한 형/친구처럼 편한 반말로 짧게 말해.',
    `아래는 ${label} 동안 추천했던 종목들의 5거래일 결과(이미 확정된 사실)와 그 종목 최근 뉴스야. 이 해설은 화면에 보여주는 '사후 해설'이야 — 결과나 숫자를 바꾸지 말고, 왜 그렇게 끝났는지만 1~2문장으로 설명해.`,
    "결과 표기의 뜻: '실현'은 목표가/손절가에 먼저 닿으면 그 가격, 아니면 5일차 종가로 청산했다고 본 수익률이고, '5일 종가'는 그냥 5일 뒤 종가 수익률이야. '손절인데 5일 종가는 플러스'면 장중에 손절가를 먼저 찍고 나중에 회복한 거라고 구분해서 말해줘.",
    "같은 종목이 여러 번 추천됐으면 그 종목에 대해 한 번만, 반복된 패턴(계속 실패/성공한 이유)을 중심으로 설명해. 뉴스가 마땅치 않으면 당시 근거가 먹혔는지로 판단하고, 데이터에 없는 건 추측하지 마.",
    '다른 설명 없이 JSON으로만: {"explanations": [{"code": "종목코드", "explanation": "해설"}]}',
  ].join("\n");

  const text = await callLlm(system, blocks, 2200);
  const parsed = text ? parseJsonObject(text) : null;
  const list = Array.isArray(parsed?.explanations) ? (parsed!.explanations as unknown[]) : [];
  const byCode = new Map(picked.map((g) => [g.code, g.name]));
  const out: StockExplanation[] = [];
  for (const e of list) {
    const o = e as Record<string, unknown>;
    if (typeof o?.code === "string" && typeof o?.explanation === "string" && byCode.has(o.code)) {
      out.push({ code: o.code, name: byCode.get(o.code)!, text: o.explanation });
    }
  }
  return out;
}

// (b) 총평 + 다음 예측에 반영할 교훈 — 결과 통계(+추천 당시 수치)만 입력.
// 뉴스/사후 정보는 일부러 안 준다. 표본이 작으면 "아직 결론 내기 이르다"고
// 말하게 강제해서 우연을 패턴으로 착각하지 않게 한다.
async function writeNarrative(
  label: string,
  rows: OutcomeRow[],
  groups: StockGroup[]
): Promise<{ summary: string; insights: string[] } | null> {
  const repeated = groups
    .filter((g) => g.predictions >= 2)
    .map((g) => `- ${g.name}: ${g.predictions}회 추천 → 목표 ${g.target} / 손절 ${g.stop} / 기간종료 ${g.timeout} / 판정불가 ${g.ambiguous}, 평균 실현 ${fmtPct(g.avgRealizedPct)}`)
    .join("\n");

  const user = [learningBlockFromRows(rows), repeated ? `[같은 종목 반복 추천]\n${repeated}` : ""].filter(Boolean).join("\n\n");

  const system = [
    '너는 "Golgoo"라는 개인 투자 AI야. 친한 형/친구처럼 편한 반말로, 확신 있지만 과장 없는 어조로 말해.',
    `아래는 ${label} 예상종목 결과를 코드가 집계한 숫자야(누적 성과 + 조건별 성과). 숫자는 전부 주어진 것만 쓰고 새로 계산하거나 지어내지 마.`,
    "1) summary: 이번 기간 총평 3~4문장. 목표 도달률만 보지 말고 손익비와 손익분기 목표도달률, 평균 실현수익을 같이 짚어서 '지금 전략이 돈을 벌고 있는지'를 솔직하게 말해.",
    "2) insights: 다음 종목 선정에 반영할 교훈 최대 3개(각 한 문장). 조건별 성과는 반드시 '전체 평균(기준선)'과 비교해서 판단해 — 어떤 조건의 성과가 나쁘다는 건 기준선보다 나쁠 때만 의미가 있어(후보 대부분이 해당하는 조건은 기준선과 같은 얘기일 뿐). 교훈의 근거는 표본 10건 이상이고 '비교 불가' 표시가 없는 조건만 쓸 수 있어. '표본 부족'이거나 비교 불가인 조건은 교훈으로 삼지 말고, 근거 있는 교훈이 없으면 insights에 '아직 표본이 부족해서 조건별 가중치는 바꾸지 않고 관찰 중'이라고만 써.",
    "확정적 보장이 아니라 데이터에 근거한 관찰이라는 톤을 유지해.",
    '다른 설명 없이 JSON으로만: {"summary": "총평", "insights": ["교훈"]}',
  ].join("\n");

  const text = await callLlm(system, user, 1200);
  const parsed = text ? parseJsonObject(text) : null;
  if (!parsed || typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;
  const insights = Array.isArray(parsed.insights) ? parsed.insights.filter((x): x is string => typeof x === "string") : [];
  return { summary: parsed.summary, insights };
}

// 그 기간 행들의 후보 중 코드가 있는(=추적 가능한) 것 수 — 결과 DB에 그만큼
// 있어야 "이 기간 추적이 다 끝났다"고 본다.
function expectedTrackableCount(rows: { candidates: string }[]): number {
  let n = 0;
  for (const r of rows) {
    try {
      const list = JSON.parse(r.candidates) as { code?: unknown }[];
      n += list.filter((c) => typeof c?.code === "string").length;
    } catch {
      // 파싱 안 되는 옛 행은 셈에서 제외
    }
  }
  return n;
}

// 최근 rows를 기간별로 묶고, 그중 (a) 아직 분석이 없고 (b) 모든 추적 가능한
// 후보의 결과가 확정된 기간만 골라 하나씩 생성한다 — 크론이 매일 돌면서
// "이제 막 끝난 기간이 있는지"만 확인하는 형태라, 이미 분석된 기간은 계속
// 건너뛴다(멱등).
export async function generatePeriodAnalysis(periodType: PeriodType): Promise<void> {
  const rows = await prisma.weeklyPrediction.findMany({
    where: { forDate: { lt: todayISO() } },
    orderBy: { forDate: "asc" },
    take: 400,
  });
  if (rows.length === 0) return;

  // 창이 막 끝난 예측의 결과를 먼저 확정해서 결과 DB에 넣는다(이미 있는 건
  // 건너뛰는 멱등 호출이라 매번 불러도 싸다).
  await resolvePendingOutcomes().catch((e) => console.error("[period-analysis] resolvePendingOutcomes failed:", e));

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = periodKeyFor(periodType, row.forDate);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  // 가장 최근 기간(진행 중일 확률이 매우 높음)은 아예 건너뛴다.
  const keys = [...groups.keys()].sort();
  keys.pop();

  const stalenessCutoff = daysAgoISO(14);

  for (const key of keys) {
    const existing = await prisma.periodAnalysis.findUnique({
      where: { periodType_periodKey: { periodType, periodKey: key } },
    });
    if (existing) continue;

    const groupRows = groups.get(key)!;
    const dates = new Set(groupRows.map((r) => r.forDate));
    const outcomes = (await loadOutcomeRows({ from: groupRows[0].forDate, to: groupRows[groupRows.length - 1].forDate })).filter((o) =>
      dates.has(o.forDate)
    );

    // 결과가 다 확정되기 전에는 다음에 다시 시도. 단, KIS에서 차트를 계속
    // 못 받는 종목 하나 때문에 기간 전체가 영영 안 만들어지지 않게, 마지막
    // 추천일이 14일보다 더 지났으면 있는 결과만으로 진행한다.
    const expected = expectedTrackableCount(groupRows);
    const allSettled = outcomes.length >= expected;
    const oldEnough = groupRows.every((r) => r.forDate <= stalenessCutoff);
    if (outcomes.length === 0 || (!allSettled && !oldEnough)) continue;

    const stats = summarize(outcomes);
    const stockGroups = groupByStock(outcomes);
    const label = periodLabelFor(periodType, key);
    const { start, end } = periodRangeFor(periodType, key);

    // 종목 해설에 붙일 "당시 추천 근거"(추천 시점에 저장된 텍스트)
    const reasoningByKey = new Map<string, string>();
    for (const r of groupRows) {
      try {
        for (const c of JSON.parse(r.candidates) as { code?: string; reasoning?: string }[]) {
          if (c.code && c.reasoning) reasoningByKey.set(`${r.forDate}|${c.code}`, c.reasoning);
        }
      } catch {
        // 무시
      }
    }

    // 추천 당시 목표가/손절가가 저장되기 전의 옛 기록만 있는 기간(판정 가능 0건)
    // 은 LLM에게 넘길 통계가 없어서 총평이 어색해진다(빈 데이터를 "데이터가
    // 없다"고 말하는 문장이 나옴) — 이런 기간은 5일 종가 기준 사실만 코드로
    // 정직하게 요약하고 교훈도 만들지 않는다.
    const [explanations, narrative] = await Promise.all([
      explainStocks(label, stockGroups, reasoningByKey),
      stats.rated > 0 ? writeNarrative(label, outcomes, stockGroups) : Promise.resolve(null),
    ]);

    const closeOnlySummary = `${label} 예상 ${stats.total}건은 추천 당시 목표가·손절가가 저장되기 전의 기록이라 목표/손절 판정은 할 수 없어요. 5일 종가 기준으로는 ${stats.closeUp}건 상승 마감, ${stats.closeDown}건 하락 마감, 평균 ${fmtPct(stats.avgClosePct, 2)} (중앙값 ${fmtPct(stats.medianClosePct, 2)})였어요.`;
    const fallbackSummary =
      stats.rated === 0
        ? closeOnlySummary
        : `${label} 예상 ${stats.total}건 중 판정 가능 ${stats.rated}건 — 목표 ${stats.target} / 손절 ${stats.stop} / 기간종료 ${stats.timeout}${stats.ambiguous ? ` / 판정불가 ${stats.ambiguous}` : ""}.`;

    await prisma.periodAnalysis.upsert({
      where: { periodType_periodKey: { periodType, periodKey: key } },
      create: {
        periodType,
        periodKey: key,
        label,
        startDate: start,
        endDate: end,
        summary: narrative?.summary ?? fallbackSummary,
        candidateHitRate: stats.targetRate !== null ? stats.targetRate / 100 : null,
        results: JSON.stringify({ v: 2, explanations }),
        categoryStats: JSON.stringify([]), // v2부터는 읽을 때 결과 DB에서 즉석 계산(getPeriodAnalyses) — 컬럼은 옛 스키마 호환용으로만 남김
        insights: JSON.stringify(narrative?.insights ?? []),
      },
      update: {}, // 이미 있으면 그대로 — 위 existing 체크로 사실상 도달 안 함
    });
  }
}

function parseInsights(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const p: unknown = JSON.parse(raw);
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseExplanations(raw: string): StockExplanation[] {
  try {
    const p = JSON.parse(raw) as { v?: number; explanations?: StockExplanation[] } | unknown[];
    if (!Array.isArray(p) && p && Array.isArray(p.explanations)) return p.explanations;
  } catch {
    // 옛 v1(배열) 형식이나 깨진 값 — 해설 없이 보여준다
  }
  return [];
}

export async function getPeriodAnalyses(periodType: PeriodType, limit = 12): Promise<PeriodAnalysisData[]> {
  const rows = await prisma.periodAnalysis.findMany({
    where: { periodType },
    orderBy: { periodKey: "desc" },
    take: limit,
  });
  if (rows.length === 0) return [];

  // 통계는 저장해두지 않고 읽을 때마다 결과 DB에서 집계한다 — 저장본은 옛
  // 정의(종가 기준)로 굳어버리지만 이쪽은 항상 최신 정의와 일치한다.
  const allOutcomes = await loadOutcomeRows();

  return rows.map((r) => {
    const outcomes = allOutcomes.filter((o) => o.forDate >= r.startDate && o.forDate <= r.endDate);
    const stats = summarize(outcomes);
    return {
      periodType,
      periodKey: r.periodKey,
      label: r.label,
      startDate: r.startDate,
      endDate: r.endDate,
      summary: r.summary,
      candidateHitRate: stats.targetRate !== null ? stats.targetRate / 100 : r.candidateHitRate,
      stats,
      stockGroups: groupByStock(outcomes),
      verdictStats: verdictConditionStats(outcomes),
      featureStats: featureConditionStats(outcomes),
      explanations: parseExplanations(r.results),
      insights: parseInsights(r.insights),
    };
  });
}

// lib/weekly-prediction.ts가 다음 종목 선정 프롬프트에 읽어 넣는 연결 지점 —
// 가장 최근 주간분석의 insights. 이제 그 insights는 표본 10건 이상인 조건에서만
// 나오도록 강제돼 있고(writeNarrative), 없으면 "관찰 중"이라고만 적힌다.
// 실제 숫자 근거는 lib/prediction-learning.ts의 누적 블록이 따로 준다.
export async function latestWeeklyInsightsBlock(): Promise<string> {
  const latest = await prisma.periodAnalysis.findFirst({
    where: { periodType: "week" },
    orderBy: { periodKey: "desc" },
  });
  if (!latest) return "";
  const insights = parseInsights(latest.insights);
  if (insights.length === 0) return "";
  const lines = [`[지난 주간분석(${latest.label}) 교훈 — 표본이 충분한 조건에서만 나온 것]`, ...insights.map((s) => `- ${s}`)];
  return lines.join("\n");
}
