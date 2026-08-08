import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { recentWeeksHistoryBlock, recentIssuesBlock, telegramBlock } from "@/lib/bro-context";
import { getScoredPredictionHistory } from "@/lib/prediction-scoring";
import { currentWeekKey, nextWeekKey } from "@/lib/week";

const SYSTEM_PROMPT = [
  "너는 한국 주식시장의 다음 주 흐름을 예상하는 애널리스트야.",
  "아래 최근 몇 주간의 섹터·언급 흐름, 최근 종목별 실제 뉴스 이슈, 텔레그램 제보, (있다면) 과거 예측 적중 이력을 종합해서 다음 주에 강세를 보일 가능성이 있는 섹터와 종목을 예상해.",
  "과거 예측 적중 이력이 있다면 반드시 참고해 — 어떤 유형의 근거가 잘 맞았는지, 안 맞았는지를 이번 예측에 반영해.",
  "확정적 보장이 아니라 데이터에 근거한 관찰이라는 점을 유지해. 데이터에 없는 건 추측하지 마.",
  "다른 설명 없이 아래 JSON 형식으로만 답해:",
  '{"summary": "다음 주 전망 핵심을 3-4문장으로", "sectors": [{"name": "섹터/테마명", "reasoning": "근거 한 문장"}] (2-3개), "candidates": [{"name": "종목명", "code": "종목코드(알면, 모르면 생략)", "reasoning": "근거 한 문장"}] (3-5개)}',
].join("\n");

type RawItem = Record<string, unknown>;

function isSectorLike(x: unknown): x is { name: string; reasoning: string } {
  return !!x && typeof x === "object" && typeof (x as RawItem).name === "string" && typeof (x as RawItem).reasoning === "string";
}

type ParsedPrediction = { summary: string; sectors: unknown[]; candidates: unknown[] };

function parseResponse(text: string): ParsedPrediction | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;
    return {
      summary: parsed.summary,
      sectors: Array.isArray(parsed.sectors) ? parsed.sectors : [],
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
    };
  } catch {
    return null;
  }
}

async function pastAccuracyBlock(): Promise<string> {
  const scored = await getScoredPredictionHistory(4);
  if (scored.length === 0) return "";

  const lines = ["[과거 예측 적중 이력]"];
  for (const s of scored) {
    const sectorPct = s.sectorHitRate !== null ? `${Math.round(s.sectorHitRate * 100)}%` : "-";
    const candPct = s.candidateHitRate !== null ? `${Math.round(s.candidateHitRate * 100)}%` : "-";
    lines.push(
      `${s.label}: 섹터 적중 ${sectorPct}, 종목 적중 ${candPct} (예측 섹터: ${s.sectors.map((x) => x.name).join(", ") || "-"} / 실제 주도 섹터: ${s.actualHotSector ?? "-"})`
    );
  }
  return lines.join("\n");
}

// Runs once a week (Friday close, see app/api/cron/weekly-prediction) —
// generates a prediction FOR the upcoming week (not the one ending today),
// using this week's momentum, real per-stock news, Telegram tips, and its
// own past accuracy as input. Upserts by forWeekKey so a retried cron run
// just overwrites that week's prediction rather than duplicating it.
export async function generateWeeklyPrediction(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const forWeekKey = nextWeekKey(currentWeekKey());

  const [historyBlock, issuesBlock, tgBlock, accBlock] = await Promise.all([
    recentWeeksHistoryBlock(4),
    recentIssuesBlock(20),
    telegramBlock(),
    pastAccuracyBlock(),
  ]);

  const userPrompt = [historyBlock, issuesBlock, tgBlock, accBlock].filter(Boolean).join("\n\n");
  if (!userPrompt.trim()) return; // nothing to reason from yet (e.g. brand-new deployment)

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2500,
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = parseResponse(text);
  if (!parsed) return;

  const sectors = JSON.stringify(parsed.sectors.filter(isSectorLike));
  const candidates = JSON.stringify(
    parsed.candidates.filter(isSectorLike).map((c) => ({
      ...c,
      code: typeof (c as RawItem).code === "string" ? (c as RawItem).code : undefined,
    }))
  );

  await prisma.weeklyPrediction.upsert({
    where: { forWeekKey },
    create: { forWeekKey, summary: parsed.summary, sectors, candidates },
    update: { summary: parsed.summary, sectors, candidates },
  });
}
