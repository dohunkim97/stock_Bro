// 기록보관소의 주간분석/월간분석 — 그 기간에 나온 모든 일간 예상종목의
// 5거래일 추적이 전부 끝난 뒤(scorePrediction이 그 기간 모든 행에 대해
// non-null을 반환해야) 딱 한 번 생성되는 리포트. 실제로 오른 종목은 왜
// 올랐는지, 내린 종목은 왜 내렸는지를 관련 실제 뉴스에 근거해서 LLM이
// 설명하고, 전체 적중률과 총평을 남긴다. week/month는 스키마·생성 로직이
// 완전히 동일하고 기간 키 포맷만 다르므로 한 함수에 파라미터로 합쳤다.
//
// "자체 학습": 여기서 시황/거래량/차트/재료/수급/재무 6개 항목의 O/X 판단
// (lib/candidate-detail.ts의 verdicts, 생성 시점에 이미 저장돼 있음)이
// 실제 수익률과 얼마나 맞아떨어졌는지 항목별로 집계하고(categoryStats),
// 그 데이터를 근거로 LLM이 "다음에 참고할 점"(insights) 몇 개를 뽑는다 —
// lib/weekly-prediction.ts가 다음 종목 선정 프롬프트에 이 insights를 그대로
// 읽어 넣어서, 쌓인 성공/실패 데이터가 실제로 다음 예측에 반영되는 피드백
// 루프를 만든다(latestWeeklyInsightsBlock).
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { scorePrediction, type ScoredCandidate } from "@/lib/prediction-scoring";
import { parseStoredCandidateDetails, type CandidateDetail } from "@/lib/candidate-detail";
import { fetchNews } from "@/lib/naver-news";
import { weekInfoFromDate, weekInfoFromKey } from "@/lib/week";
import { todayISO } from "@/lib/dates";
import { formatChg } from "@/lib/format";

export type PeriodType = "week" | "month";

export type CandidateResult = {
  name: string;
  code?: string;
  reasoning: string;
  finalChangePct: number | null;
  hit: boolean;
  hitTarget: boolean; // 5거래일 안에 목표가 도달
  hitStop: boolean; // 5거래일 안에 손절가 도달
  explanation: string; // 왜 올랐는지/내렸는지 — 상위 변동 종목만 채워지고 나머지는 빈 문자열
};

type CategoryKey = "marketContext" | "volume" | "chart" | "material" | "supplyDemand" | "financial";

const CATEGORY_LABEL: Record<CategoryKey, string> = {
  marketContext: "시황",
  volume: "거래량",
  chart: "차트",
  material: "재료",
  supplyDemand: "수급",
  financial: "재무",
};

export type CategoryStat = {
  key: CategoryKey;
  label: string;
  positiveCount: number;
  positiveAvgReturn: number | null;
  negativeCount: number;
  negativeAvgReturn: number | null;
};

export type PeriodAnalysisData = {
  periodType: PeriodType;
  periodKey: string;
  label: string;
  startDate: string;
  endDate: string;
  summary: string;
  candidateHitRate: number | null;
  results: CandidateResult[];
  categoryStats: CategoryStat[];
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

// LLM에 개별 근거를 요청하는 건 변동폭이 큰(=사용자가 실제로 궁금해할)
// 종목으로 제한한다 — 월간분석은 후보가 최대 100개 가까이 쌓일 수 있어
// 전부 다 물어보면 프롬프트가 지나치게 커진다. 나머지는 적중률 통계에는
// 그대로 포함되지만 개별 설명 없이 결과 목록에만 나온다.
const MAX_EXPLAINED = 12;

// 시황/거래량/차트/재료/수급/재무 판단(O/X)이 실제 수익률과 얼마나
// 맞아떨어졌는지 항목별로 집계 — O 평균과 X 평균이 뚜렷이 갈릴수록 그
// 항목이 실제로 잘 맞았다는 뜻. 순수 실데이터 계산이라 LLM이 관여하지
// 않는다(synthesizeNarrative가 이 결과를 문장으로 풀어쓰기만 함).
function buildCategoryStats(
  rows: { finalChangePct: number | null; verdicts: CandidateDetail["verdicts"] | null }[]
): CategoryStat[] {
  const keys = Object.keys(CATEGORY_LABEL) as CategoryKey[];
  return keys.map((key) => {
    const withVerdict = rows.filter(
      (r): r is typeof r & { finalChangePct: number } => r.verdicts !== null && r.verdicts[key] !== null && r.finalChangePct !== null
    );
    const positive = withVerdict.filter((r) => r.verdicts![key] === true);
    const negative = withVerdict.filter((r) => r.verdicts![key] === false);
    const avg = (list: typeof withVerdict) =>
      list.length > 0 ? list.reduce((s, r) => s + r.finalChangePct, 0) / list.length : null;
    return {
      key,
      label: CATEGORY_LABEL[key],
      positiveCount: positive.length,
      positiveAvgReturn: avg(positive),
      negativeCount: negative.length,
      negativeAvgReturn: avg(negative),
    };
  });
}

function parseAnalysisResponse(
  text: string
): { summary: string; explanations: Map<string, string>; insights: string[] } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;
    const explanations = new Map<string, string>();
    if (Array.isArray(parsed.explanations)) {
      for (const e of parsed.explanations) {
        if (e && typeof e.name === "string" && typeof e.explanation === "string") {
          explanations.set(e.name, e.explanation);
        }
      }
    }
    const insights = Array.isArray(parsed.insights) ? parsed.insights.filter((x: unknown) => typeof x === "string") : [];
    return { summary: parsed.summary, explanations, insights };
  } catch {
    return null;
  }
}

async function explainMovers(
  label: string,
  candidates: ScoredCandidate[],
  categoryStats: CategoryStat[]
): Promise<{ summary: string; explanations: Map<string, string>; insights: string[] } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const byMagnitude = [...candidates]
    .sort((a, b) => Math.abs(b.finalChangePct ?? 0) - Math.abs(a.finalChangePct ?? 0))
    .slice(0, MAX_EXPLAINED);
  // 오르긴 했는데 목표가까지는 못 간 종목("왜 목표가 도달을 못 했는지"도
  // 판단해달라는 요청) — 등락폭이 작아서 위 상위 12개에 안 뽑혔더라도
  // 별도로 몇 개 더 챙긴다. 이미 뽑힌 종목과는 중복하지 않는다.
  const missedTarget = candidates
    .filter((c) => !byMagnitude.includes(c) && !c.hitTarget && (c.finalChangePct ?? -1) > 0)
    .slice(0, 5);
  const toExplain = [...byMagnitude, ...missedTarget];

  const newsByName = new Map(
    await Promise.all(
      toExplain.map(async (c) => [c.name, await fetchNews(c.name, 3)] as const)
    )
  );

  const stockBlocks = toExplain
    .map((c) => {
      const news = newsByName.get(c.name) ?? [];
      const newsLine = news.length > 0 ? news.map((n) => n.title).join(" / ") : "관련 뉴스 없음";
      const pct = c.finalChangePct !== null ? `${c.finalChangePct >= 0 ? "+" : ""}${c.finalChangePct.toFixed(2)}%` : "추적 불가";
      const outcome = c.hitTarget
        ? " (목표가 도달)"
        : c.hitStop
          ? " (손절가 도달)"
          : (c.finalChangePct ?? 0) > 0
            ? " (상승했지만 목표가 미달성)"
            : "";
      return `- ${c.name}: 결과 ${pct}${outcome} (당시 추천 근거: "${c.reasoning}") / 최근 뉴스: ${newsLine}`;
    })
    .join("\n");

  const total = candidates.length;
  const hitCount = candidates.filter((c) => c.hit).length;
  const targetCount = candidates.filter((c) => c.hitTarget).length;
  const stopCount = candidates.filter((c) => c.hitStop).length;

  const categoryLines = categoryStats
    .map((c) => {
      const pos = c.positiveCount > 0 ? `(O) ${c.positiveCount}건 평균 ${formatChg(c.positiveAvgReturn ?? 0)}` : "(O) 데이터 없음";
      const neg = c.negativeCount > 0 ? `(X) ${c.negativeCount}건 평균 ${formatChg(c.negativeAvgReturn ?? 0)}` : "(X) 데이터 없음";
      return `- ${c.label}: ${pos} / ${neg}`;
    })
    .join("\n");

  const system = [
    '너는 "Golgoo"라는 개인 투자 AI야. 친한 형/친구처럼 편한 반말로, 확신 있는 어조로 말해.',
    `아래는 ${label} 동안 네가 예상 리포트에서 추천했던 종목들이 실제로 5거래일 지난 뒤 나온 결과(매수가 대비 최종 등락률)와, 그 종목 관련 최근 뉴스야. 이번 기간 전체 적중률은 ${total}개 중 ${hitCount}개(${((hitCount / total) * 100).toFixed(0)}%), 목표가 도달 ${targetCount}건, 손절가 도달 ${stopCount}건이야.`,
    "각 종목이 왜 올랐는지 내렸는지, 뉴스를 최대한 활용해서 설명해줘 — 관련 뉴스가 마땅치 않으면 당시 추천 근거(재료)가 그대로 먹혔는지 안 먹혔는지로 판단해.",
    "'상승했지만 목표가 미달성'이라고 표시된 종목은 특히 신경 써서 — 방향은 맞았는데 왜 목표가(저항선)까지는 못 뚫었는지(거래량 부족, 시장 전체 조정, 저항이 예상보다 강했는지 등) 짚어줘. 손절가 도달 종목도 마찬가지로 애초에 근거가 틀렸던 건지, 맞는 방향인데 단기 조정에 걸린 건지 구분해서 설명해.",
    "[항목별(O/X) 판단과 실제 수익률 — 실데이터로 이미 계산됨, 숫자는 지어내지 마]",
    categoryLines,
    "1) summary: 전체 총평(적중률과 함께, 위 항목별 데이터를 근거로 어떤 유형의 근거가 실제로 잘 맞았는지 안 맞았는지 구체적으로) 3~4문장.",
    "2) insights: 다음 주 종목을 고를 때 실제로 반영할 수 있는 구체적인 교훈 3~5개, 각각 한 문장으로 — 위 항목별 데이터에서 실제로 드러난 패턴만 반영해(막연한 일반론 금지). 예: '거래량이 늘지 않은 종목은 신중하게 접근'.",
    "확정적 보장이 아니라 데이터에 근거한 관찰이라는 톤을 유지해.",
    "다른 설명 없이 아래 JSON 형식으로만 답해:",
    '{"summary": "전체 총평 3-4문장", "explanations": [{"name": "종목명", "explanation": "오르거나 내린 이유 한두 문장"}], "insights": ["...", "..."]}',
  ].join("\n");

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2200,
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: stockBlocks }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return parseAnalysisResponse(text);
  } catch {
    return null;
  }
}

// 최근 rows를 기간별로 묶고, 그중 (a) 아직 분석이 없고 (b) 모든 행의
// 5거래일 창이 다 끝난 기간만 골라 하나씩 생성한다 — 크론이 매일 돌면서
// "이제 막 끝난 기간이 있는지"만 확인하는 형태라, 이미 분석된 기간은 계속
// 건너뛴다(멱등).
export async function generatePeriodAnalysis(periodType: PeriodType): Promise<void> {
  // 하루 안 지난 forDate는 애초에 5일 창이 끝날 수 없으니 제외 — 대략
  // 최근 4개월치(월간이 가장 넓은 창을 필요로 함)만 훑는다.
  const rows = await prisma.weeklyPrediction.findMany({
    where: { forDate: { lt: todayISO() } },
    orderBy: { forDate: "asc" },
    take: 400,
  });
  if (rows.length === 0) return;

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = periodKeyFor(periodType, row.forDate);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  // 가장 최근 기간(진행 중일 확률이 매우 높음)은 아예 건너뛴다 — 굳이
  // scorePrediction까지 다 불러서 "아직 안 끝났다"는 결론을 매번 다시
  // 낼 필요 없이, 마지막 그룹 하나는 애초에 제외.
  const keys = [...groups.keys()].sort();
  keys.pop();

  for (const key of keys) {
    const existing = await prisma.periodAnalysis.findUnique({
      where: { periodType_periodKey: { periodType, periodKey: key } },
    });
    if (existing) continue;

    // 한 행당 최대 5종목이 각자 KIS 차트를 불러오는데(scorePrediction 내부),
    // 여러 행을 Promise.all로 한꺼번에 돌리면(한 달치는 최대 20여 행) 동시
    // 요청이 너무 많아져 KIS 레이트리밋에 걸린다 — 실제로 겪은 문제: 같은
    // 8월 데이터를 주간/월간 두 번 채점했더니 매번 다른 종목이 랜덤하게
    // "결과 없음"으로 빠졌다(scorePrediction 자체엔 재시도가 있지만, 그래도
    // 동시 요청 수 자체를 줄이는 게 안전하다). 행 단위로는 순차 처리.
    const groupRows = groups.get(key)!;
    const scored: Awaited<ReturnType<typeof scorePrediction>>[] = [];
    for (const r of groupRows) {
      scored.push(await scorePrediction(r));
    }
    if (scored.some((s) => s === null)) continue; // 이 기간 안 어느 하루라도 아직 5거래일이 안 끝났으면 다음에 다시 시도

    // verdicts(시황/거래량/차트/재료/수급/재무 O/X)는 candidate-detail.ts가
    // 생성 시점에 이미 계산해 WeeklyPrediction.details에 저장해둔 값을 그대로
    // 재사용한다 — forDate별로 이름→verdicts 맵을 만들어 매칭.
    const verdictsByForDate = new Map<string, Map<string, CandidateDetail["verdicts"]>>();
    for (const r of groupRows) {
      const stored = parseStoredCandidateDetails(r.details);
      verdictsByForDate.set(r.forDate, new Map((stored ?? []).map((d) => [d.name, d.verdicts])));
    }

    const enrichedCandidates = scored
      .flatMap((s) =>
        s!.candidates.map((c) => ({ ...c, verdicts: verdictsByForDate.get(s!.forDate)?.get(c.name) ?? null }))
      )
      .filter((c) => c.finalChangePct !== null);
    if (enrichedCandidates.length === 0) continue;

    const categoryStats = buildCategoryStats(enrichedCandidates);
    const label = periodLabelFor(periodType, key);
    const { start, end } = periodRangeFor(periodType, key);
    const llm = await explainMovers(label, enrichedCandidates, categoryStats);

    const results: CandidateResult[] = enrichedCandidates.map((c) => ({
      name: c.name,
      code: c.code,
      reasoning: c.reasoning,
      finalChangePct: c.finalChangePct,
      hit: c.hit,
      hitTarget: c.hitTarget,
      hitStop: c.hitStop,
      explanation: llm?.explanations.get(c.name) ?? "",
    }));

    const hitCount = enrichedCandidates.filter((c) => c.hit).length;

    await prisma.periodAnalysis.upsert({
      where: { periodType_periodKey: { periodType, periodKey: key } },
      create: {
        periodType,
        periodKey: key,
        label,
        startDate: start,
        endDate: end,
        summary: llm?.summary ?? `${label} 예상 종목 ${enrichedCandidates.length}개 중 ${hitCount}개 적중했어.`,
        candidateHitRate: enrichedCandidates.length ? hitCount / enrichedCandidates.length : null,
        results: JSON.stringify(results),
        categoryStats: JSON.stringify(categoryStats),
        insights: JSON.stringify(llm?.insights ?? []),
      },
      update: {}, // 이미 있으면 그대로 — 위에서 existing 체크로 사실상 도달 안 함
    });
  }
}

function parseCategoryStats(raw: string | null | undefined): CategoryStat[] {
  if (!raw) return [];
  try {
    const p: unknown = JSON.parse(raw);
    return Array.isArray(p) ? (p as CategoryStat[]) : [];
  } catch {
    return [];
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

export async function getPeriodAnalyses(periodType: PeriodType, limit = 12): Promise<PeriodAnalysisData[]> {
  const rows = await prisma.periodAnalysis.findMany({
    where: { periodType },
    orderBy: { periodKey: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    periodType: periodType,
    periodKey: r.periodKey,
    label: r.label,
    startDate: r.startDate,
    endDate: r.endDate,
    summary: r.summary,
    candidateHitRate: r.candidateHitRate,
    results: JSON.parse(r.results) as CandidateResult[],
    categoryStats: parseCategoryStats(r.categoryStats),
    insights: parseInsights(r.insights),
  }));
}

// lib/weekly-prediction.ts가 다음 종목 선정 프롬프트에 그대로 읽어 넣는
// "자체 학습" 연결 지점 — 가장 최근 주간분석의 insights(다음에 참고할 점)만
// 뽑아준다. 없으면(아직 한 번도 채점 안 됨) 빈 문자열이라 프롬프트에서
// 조건부로 빠진다.
export async function latestWeeklyInsightsBlock(): Promise<string> {
  const latest = await prisma.periodAnalysis.findFirst({
    where: { periodType: "week" },
    orderBy: { periodKey: "desc" },
  });
  if (!latest) return "";
  const insights = parseInsights(latest.insights);
  if (insights.length === 0) return "";
  const lines = [`[지난 주간분석(${latest.label})에서 배운 점 — 이번 선정에 반영해]`, ...insights.map((s) => `- ${s}`)];
  return lines.join("\n");
}
