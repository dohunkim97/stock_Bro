import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { recentWeeksHistoryBlock, recentIssuesBlock, telegramBlock } from "@/lib/bro-context";
import { getScoredPredictionHistory, parsePredictionCandidates, type CandidatePrediction } from "@/lib/prediction-scoring";
import { currentWeekKey, nextWeekKey } from "@/lib/week";
import { resolveStock } from "@/lib/market-data";
import { fetchKisCodeMaster, findInCodeMaster } from "@/lib/kis-code-master";
import { fetchKisChart } from "@/lib/kis-chart";
import { computeTechnicalSignals } from "@/lib/technical-signals";

const SYSTEM_PROMPT = [
  "너는 한국 주식시장의 다음 주 흐름을 예상하는 애널리스트야.",
  "말투는 딱딱한 보고서체(~였다, ~보였다, ~니다) 말고, 친한 형/친구가 옆에서 브리핑해주는 것처럼 편한 반말로 써. 예를 들어 '~였다.' 대신 '~였어!', '~더라', '~였지' 처럼 자연스럽고 친근하게.",
  "summary·reasoning 안에서 진짜 중요한 문장이나 핵심 단어(강세 근거, 결정적 수치, 종목명 등)는 **이렇게** 별 두 개로 감싸서 강조해 — 한 항목에 한두 곳 정도면 충분해, 남발하지 마.",
  "아래 최근 몇 주간의 섹터·언급 흐름, 최근 종목별 실제 뉴스 이슈, 텔레그램 제보, (있다면) 과거 예측 적중 이력을 종합해서 다음 주에 강세를 보일 가능성이 있는 섹터와 종목을 예상해.",
  "[현재 예측 종목의 기술적 시그널]이 있으면 반드시 참고해 — 거래량 급감+음봉, 지지선 지지 확인 같은 bullish 시그널이 있는 종목은 계속 유지할 근거로, 저항선 돌파 실패·단기 급락 같은 bearish 시그널만 쌓인 종목은 교체를 고려할 근거로 써. 새 종목을 고를 때도 뉴스·수급 근거에 이런 기술적 신호가 같이 있으면 reasoning에 자연스럽게 녹여서 언급해.",
  "과거 예측 적중 이력이 있다면 반드시 참고해 — 어떤 유형의 근거가 잘 맞았는지, 안 맞았는지를 이번 예측에 반영해.",
  "확정적 보장이 아니라 데이터에 근거한 관찰이라는 점을 유지해. 데이터에 없는 건 추측하지 마.",
  "다른 설명 없이 아래 JSON 형식으로만 답해:",
  '{"summary": "다음 주 전망 핵심을 3-4문장으로", "sectors": [{"name": "섹터/테마명", "reasoning": "근거 한 문장"}] (2-3개), "candidates": [{"name": "정확한 종목명", "reasoning": "근거 한 문장"}] (3-5개)}',
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

// Real-data confirmation/warning for whatever candidates the CURRENT
// forWeekKey row already has, computed fresh from each candidate's daily
// chart (lib/technical-signals.ts — 거래량/지지·저항 rules transcribed from
// trading-book material) — not something the LLM is asked to "remember",
// but a concrete signal list handed to it as input. Empty (not "") when
// there's nothing to show yet (first-ever generation, or no candidates
// have a resolvable code).
async function technicalSignalsBlock(candidates: CandidatePrediction[]): Promise<string> {
  const withCode = candidates.filter((c): c is CandidatePrediction & { code: string } => !!c.code);
  if (withCode.length === 0) return "";

  const perCandidate = await Promise.all(
    withCode.map(async (c) => {
      const candles = await fetchKisChart(c.code, "D");
      const signals = computeTechnicalSignals(candles);
      return { name: c.name, signals };
    })
  );

  const lines = ["[현재 예측 종목의 기술적 시그널]"];
  let any = false;
  for (const p of perCandidate) {
    if (p.signals.length === 0) continue;
    any = true;
    lines.push(`- ${p.name}: ` + p.signals.map((s) => `${s.name}(${s.direction})`).join(", "));
  }
  return any ? lines.join("\n") : "";
}

// The code for a newly-appearing candidate always comes from resolveStock
// (our own DB, grounded in real synced ranking data) or, failing that, the
// KIS code-master fallback — never from whatever code the LLM itself might
// output. Confirmed live that trusting the model matters: asked to
// self-report a code, it hallucinated one for "SK이터닉스" (a real code,
// just for a completely different company) on one run and an invalid one
// on the next, while resolveStock found the correct code every time. A
// wrong code isn't just a missing feature — fetchKisQuote/fetchKisChart
// happily return real data for whatever stock that code actually belongs
// to, silently tracking the wrong company's price under the right one's
// name.
//
// Resolves every genuinely-new candidate's local lookup exactly once (not
// once for a "should we bother downloading the fallback" check and again
// per-candidate), and only downloads the KIS code-master files (a ~200KB
// fetch+parse) if at least one of them came up empty locally.
async function resolveNewCandidateCodes(names: string[]): Promise<Map<string, string | undefined>> {
  const local = await Promise.all(names.map((name) => resolveStock(name)));
  const codeByName = new Map(names.map((name, i) => [name, local[i]?.code] as const));

  if ([...codeByName.values()].every((code) => code)) return codeByName;

  const codeMaster = await fetchKisCodeMaster();
  for (const name of names) {
    if (!codeByName.get(name)) codeByName.set(name, findInCodeMaster(codeMaster, name)?.code);
  }
  return codeByName;
}

// Runs daily on weekdays (see app/api/cron/weekly-prediction), always
// targeting the upcoming week (not the one ending today) so it keeps
// refining the same forWeekKey row as fresh news/Telegram sources come in
// through the week, rather than only writing once on Friday. Upserts by
// forWeekKey so a retried cron run just overwrites that week's prediction
// rather than duplicating it.
export async function generateWeeklyPrediction(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const forWeekKey = nextWeekKey(currentWeekKey());

  // Fetched here (not after the LLM call, where the old carry-forward-only
  // read of this row used to happen) because technicalSignalsBlock needs
  // this same row's current candidates as INPUT to the prompt, not just as
  // something to merge into the output afterward.
  const existing = await prisma.weeklyPrediction.findUnique({ where: { forWeekKey } });
  const existingCandidates = existing ? parsePredictionCandidates(existing.candidates) : [];

  const [historyBlock, issuesBlock, tgBlock, accBlock, signalsBlock] = await Promise.all([
    recentWeeksHistoryBlock(4),
    recentIssuesBlock(20),
    telegramBlock(),
    pastAccuracyBlock(),
    technicalSignalsBlock(existingCandidates),
  ]);

  const userPrompt = [historyBlock, issuesBlock, tgBlock, accBlock, signalsBlock].filter(Boolean).join("\n\n");
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

  // Same-week regenerations should keep tracking each candidate's
  // performance from when it was FIRST predicted, not reset to "0%" every
  // time fresh sources trigger a rerun — so look up whatever baseline this
  // forWeekKey already had (fetched above, before the LLM call) and carry
  // it forward by name.
  const priorByName = new Map(existingCandidates.map((c) => [c.name, c] as const));

  const rawCandidates = parsed.candidates.filter(isSectorLike).map((c) => ({
    name: c.name,
    reasoning: c.reasoning,
  }));

  const newNames = rawCandidates.filter((c) => !priorByName.get(c.name)?.firstSeenAt).map((c) => c.name);
  const newCodeByName = newNames.length > 0 ? await resolveNewCandidateCodes(newNames) : new Map();

  const candidateList: CandidatePrediction[] = rawCandidates.map((c) => {
    const prior = priorByName.get(c.name);
    if (prior?.firstSeenAt) return { ...c, code: prior.code, firstSeenAt: prior.firstSeenAt };
    return { ...c, code: newCodeByName.get(c.name), firstSeenAt: new Date().toISOString() };
  });
  const candidates = JSON.stringify(candidateList);

  await prisma.weeklyPrediction.upsert({
    where: { forWeekKey },
    create: { forWeekKey, summary: parsed.summary, sectors, candidates },
    update: { summary: parsed.summary, sectors, candidates },
  });
}
