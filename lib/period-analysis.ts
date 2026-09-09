// 기록보관소의 주간분석/월간분석 — 그 기간에 나온 모든 일간 예상종목의
// 5거래일 추적이 전부 끝난 뒤(scorePrediction이 그 기간 모든 행에 대해
// non-null을 반환해야) 딱 한 번 생성되는 리포트. 실제로 오른 종목은 왜
// 올랐는지, 내린 종목은 왜 내렸는지를 관련 실제 뉴스에 근거해서 LLM이
// 설명하고, 전체 적중률과 총평을 남긴다. week/month는 스키마·생성 로직이
// 완전히 동일하고 기간 키 포맷만 다르므로 한 함수에 파라미터로 합쳤다.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { scorePrediction, type ScoredCandidate } from "@/lib/prediction-scoring";
import { fetchNews } from "@/lib/naver-news";
import { weekInfoFromDate, weekInfoFromKey } from "@/lib/week";
import { todayISO } from "@/lib/dates";

export type PeriodType = "week" | "month";

export type CandidateResult = {
  name: string;
  code?: string;
  reasoning: string;
  finalChangePct: number | null;
  hit: boolean;
  explanation: string; // 왜 올랐는지/내렸는지 — 상위 변동 종목만 채워지고 나머지는 빈 문자열
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

function parseAnalysisResponse(text: string): { summary: string; explanations: Map<string, string> } | null {
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
    return { summary: parsed.summary, explanations };
  } catch {
    return null;
  }
}

async function explainMovers(
  periodType: PeriodType,
  label: string,
  candidates: ScoredCandidate[]
): Promise<{ summary: string; explanations: Map<string, string> } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const toExplain = [...candidates]
    .sort((a, b) => Math.abs(b.finalChangePct ?? 0) - Math.abs(a.finalChangePct ?? 0))
    .slice(0, MAX_EXPLAINED);

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
      return `- ${c.name}: 결과 ${pct} (당시 추천 근거: "${c.reasoning}") / 최근 뉴스: ${newsLine}`;
    })
    .join("\n");

  const total = candidates.length;
  const hitCount = candidates.filter((c) => c.hit).length;

  const system = [
    '너는 "Golgoo"라는 개인 투자 AI야. 친한 형/친구처럼 편한 반말로, 확신 있는 어조로 말해.',
    `아래는 ${label} 동안 네가 예상 리포트에서 추천했던 종목들이 실제로 5거래일 지난 뒤 나온 결과(매수가 대비 최종 등락률)와, 그 종목 관련 최근 뉴스야. 이번 기간 전체 적중률은 ${total}개 중 ${hitCount}개(${((hitCount / total) * 100).toFixed(0)}%)야.`,
    "각 종목이 왜 올랐는지 내렸는지, 뉴스를 최대한 활용해서 설명해줘 — 관련 뉴스가 마땅치 않으면 당시 추천 근거(재료)가 그대로 먹혔는지 안 먹혔는지로 판단해.",
    "전체 총평(적중률과 함께, 어떤 유형의 근거가 잘 맞았는지 안 맞았는지)도 3~4문장으로 남겨.",
    "확정적 보장이 아니라 데이터에 근거한 관찰이라는 톤을 유지해.",
    "다른 설명 없이 아래 JSON 형식으로만 답해:",
    '{"summary": "전체 총평 3-4문장", "explanations": [{"name": "종목명", "explanation": "오르거나 내린 이유 한두 문장"}]}',
  ].join("\n");

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
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

    const allCandidates = scored.flatMap((s) => s!.candidates).filter((c) => c.finalChangePct !== null);
    if (allCandidates.length === 0) continue;

    const label = periodLabelFor(periodType, key);
    const { start, end } = periodRangeFor(periodType, key);
    const llm = await explainMovers(periodType, label, allCandidates);

    const results: CandidateResult[] = allCandidates.map((c) => ({
      name: c.name,
      code: c.code,
      reasoning: c.reasoning,
      finalChangePct: c.finalChangePct,
      hit: c.hit,
      explanation: llm?.explanations.get(c.name) ?? "",
    }));

    const hitCount = allCandidates.filter((c) => c.hit).length;

    await prisma.periodAnalysis.upsert({
      where: { periodType_periodKey: { periodType, periodKey: key } },
      create: {
        periodType,
        periodKey: key,
        label,
        startDate: start,
        endDate: end,
        summary: llm?.summary ?? `${label} 예상 종목 ${allCandidates.length}개 중 ${hitCount}개 적중했어.`,
        candidateHitRate: allCandidates.length ? hitCount / allCandidates.length : null,
        results: JSON.stringify(results),
      },
      update: {}, // 이미 있으면 그대로 — 위에서 existing 체크로 사실상 도달 안 함
    });
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
  }));
}
