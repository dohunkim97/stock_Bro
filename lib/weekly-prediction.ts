import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { recentWeeksHistoryBlock, recentIssuesBlock, telegramBlock } from "@/lib/bro-context";
import { getScoredPredictionHistory, type CandidatePrediction } from "@/lib/prediction-scoring";
import { todayISO } from "@/lib/dates";
import { resolveStock } from "@/lib/market-data";
import { fetchKisCodeMaster, findInCodeMaster } from "@/lib/kis-code-master";
import { fetchKisChart } from "@/lib/kis-chart";
import { computeTechnicalSignals } from "@/lib/technical-signals";

const SYSTEM_PROMPT = [
  "너는 한국 주식시장의 향후 5거래일 유망 종목을 뽑는 애널리스트야.",
  "말투는 딱딱한 보고서체(~였다, ~보였다, ~니다) 말고, 친한 형/친구가 옆에서 브리핑해주는 것처럼 편한 반말로 써. 예를 들어 '~였다.' 대신 '~였어!', '~더라', '~였지' 처럼 자연스럽고 친근하게.",
  "summary·reasoning 안에서 진짜 중요한 문장이나 핵심 단어(강세 근거, 결정적 수치, 종목명 등)는 **이렇게** 별 두 개로 감싸서 강조해 — 한 항목에 한두 곳 정도면 충분해, 남발하지 마.",
  "이 리포트는 매일 새로 나가고, 오늘 종가(15:30)에 매수했다고 가정하고 5거래일 동안의 성과를 추적해 — 그러니 '다음 주' 같은 표현 대신 '오늘부터 5거래일' 식으로 말해.",
  "아래 최근 몇 주간의 섹터·언급 흐름, 최근 종목별 실제 뉴스 이슈, 텔레그램 제보, [관심 종목군의 기술적 시그널], (있다면) 과거 예측 적중 이력을 종합해서 종목을 선정해.",
  "[관심 종목군의 기술적 시그널]은 실제 차트 데이터로 계산된 값이야(거래량 급감+음봉·지지선 지지 확인·8일선 지지·33일선 정찰병 매수·45일선 반등·이동평균선 정배열 같은 bullish 시그널 / 저항선 돌파 실패·단기 급락·이동평균선 역배열·45일선 터치 시 거래량 증가(반등 제외) 같은 bearish 시그널) — 종목을 고를 때 반드시 참고하고, 있는 종목은 reasoning에 자연스럽게 녹여서 언급해.",
  "과거 예측 적중 이력이 있다면 반드시 참고해 — 어떤 유형의 근거가 잘 맞았는지, 안 맞았는지를 이번 선정에 반영해.",
  "판단 원칙: 진짜 호재를 품은 종목은 하루에 -5% 넘게 잘 안 빠져 — 뉴스는 좋은데 최근 낙폭이 -5%를 넘는 종목은 호재 신뢰도를 의심하고 신중하게 다뤄. 목표 구간·손절선은 항상 같이 언급해서, 평단가를 위협하면 미련 없이 손절한다는 원칙이 자연스럽게 드러나게 해.",
  "확정적 보장이 아니라 데이터에 근거한 관찰이라는 점을 유지해. 데이터에 없는 건 추측하지 마.",
  "다른 설명 없이 아래 JSON 형식으로만 답해:",
  '{"summary": "오늘부터 5거래일 전망 핵심을 3-4문장으로", "sectors": [{"name": "섹터/테마명", "reasoning": "근거 한 문장"}] (2-3개), "candidates": [{"name": "정확한 종목명", "reasoning": "근거 한 문장"}] (3-5개)}',
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
  const scored = await getScoredPredictionHistory(5);
  if (scored.length === 0) return "";

  const lines = ["[과거 예측 적중 이력 — 5거래일 뒤 기준]"];
  for (const s of scored) {
    const sectorPct = s.sectorHitRate !== null ? `${Math.round(s.sectorHitRate * 100)}%` : "-";
    const candPct = s.candidateHitRate !== null ? `${Math.round(s.candidateHitRate * 100)}%` : "-";
    lines.push(
      `${s.label}: 섹터 적중 ${sectorPct}, 종목 적중 ${candPct} (예측 섹터: ${s.sectors.map((x) => x.name).join(", ") || "-"} / 실제 주도 섹터: ${s.actualHotSector ?? "-"})`
    );
  }
  return lines.join("\n");
}

const SHORTLIST_SIZE = 15;

// A pool of "지금 뉴스가 실제로 붙어있는" stocks to run technical-signal
// detection against BEFORE the LLM picks — not just re-affirming whatever
// was already chosen (there's no carry-forward anymore, every day is a
// fresh pick), but giving the model real chart-derived signals for
// candidates it might actually choose from. Reuses DailyEntry.code
// directly (already populated by the sync pipeline) rather than a name
// lookup, since these are all stocks that showed up in a real sync.
async function signalShortlistBlock(): Promise<string> {
  const rows = await prisma.dailyEntry.findMany({
    where: { issue: { not: null }, code: { not: null } },
    orderBy: { createdAt: "desc" },
    take: SHORTLIST_SIZE * 2,
  });
  const seen = new Set<string>();
  const shortlist = rows.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true))).slice(0, SHORTLIST_SIZE);
  if (shortlist.length === 0) return "";

  const perStock = await Promise.all(
    shortlist.map(async (r) => {
      const candles = await fetchKisChart(r.code!, "D");
      return { name: r.name, signals: computeTechnicalSignals(candles) };
    })
  );

  const lines = ["[관심 종목군의 기술적 시그널]"];
  let any = false;
  for (const p of perStock) {
    if (p.signals.length === 0) continue;
    any = true;
    lines.push(`- ${p.name}: ` + p.signals.map((s) => `${s.name}(${s.direction})`).join(", "));
  }
  return any ? lines.join("\n") : "";
}

// The code for every picked candidate always comes from resolveStock (our
// own DB, grounded in real synced ranking data) or, failing that, the KIS
// code-master fallback — never from whatever code the LLM itself might
// output. Confirmed live that trusting the model matters: asked to
// self-report a code, it hallucinated one for "SK이터닉스" (a real code,
// just for a completely different company) on one run and an invalid one
// on the next, while resolveStock found the correct code every time. A
// wrong code isn't just a missing feature — fetchKisQuote/fetchKisChart
// happily return real data for whatever stock that code actually belongs
// to, silently tracking the wrong company's price under the right one's
// name.
//
// Resolves every candidate's local lookup exactly once (not once for a
// "should we bother downloading the fallback" check and again
// per-candidate), and only downloads the KIS code-master files (a ~200KB
// fetch+parse) if at least one of them came up empty locally.
async function resolveCandidateCodes(names: string[]): Promise<Map<string, string | undefined>> {
  const local = await Promise.all(names.map((name) => resolveStock(name)));
  const codeByName = new Map(names.map((name, i) => [name, local[i]?.code] as const));

  if ([...codeByName.values()].every((code) => code)) return codeByName;

  const codeMaster = await fetchKisCodeMaster();
  for (const name of names) {
    if (!codeByName.get(name)) codeByName.set(name, findInCodeMaster(codeMaster, name)?.code);
  }
  return codeByName;
}

// Runs every trading day (see app/api/cron/weekly-prediction), publishing a
// fresh 5-trading-day pick sheet for TODAY (forDate) — a separate,
// permanent row every day (upsert only guards against a same-day retry),
// not a single row mutated in place across a week. Each candidate's
// tracking window (lib/candidate-tracking.ts) runs from forDate's own
// close, capped at 5 trading days, so yesterday's picks keep their own
// independent record in 기록보관소 even after today publishes different ones.
export async function generateWeeklyPrediction(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const forDate = todayISO();

  const [historyBlock, issuesBlock, tgBlock, accBlock, signalsBlock] = await Promise.all([
    recentWeeksHistoryBlock(4),
    recentIssuesBlock(20),
    telegramBlock(),
    pastAccuracyBlock(),
    signalShortlistBlock(),
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

  const rawCandidates = parsed.candidates.filter(isSectorLike).map((c) => ({
    name: c.name,
    reasoning: c.reasoning,
  }));
  const codeByName = await resolveCandidateCodes(rawCandidates.map((c) => c.name));
  const candidateList: CandidatePrediction[] = rawCandidates.map((c) => ({ ...c, code: codeByName.get(c.name) }));
  const candidates = JSON.stringify(candidateList);

  await prisma.weeklyPrediction.upsert({
    where: { forDate },
    create: { forDate, summary: parsed.summary, sectors, candidates },
    update: { summary: parsed.summary, sectors, candidates },
  });
}
