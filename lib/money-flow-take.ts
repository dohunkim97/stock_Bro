// "지금 자금 흐름을 보면 어디에 선제적으로 관심 가질 만한지" — generated once per
// sync (see lib/sync-runner.ts), not on every page view: this is an LLM call,
// and unlike the money-flow numbers themselves (cheap DB reads + JS math),
// running it live on every /market visit would add real latency and cost
// for no benefit since the underlying data only changes once a day. Same
// pre-generate-then-read pattern as lib/market-briefing.ts /
// lib/weekly-prediction.ts.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { formatWon } from "@/lib/format";
import type { ThemeMoneyFlowByDay, ThemeNetRank } from "@/lib/money-flow";

const SYSTEM_PROMPT = [
  '너는 "Golgoo"라는 개인 투자 AI 조력자야. 친한 형/친구처럼 편하게 반말로 짧고 명확하게 대답해.',
  "아래 데이터는 테마별 거래대금(시장 관심도) 누적 순위와, 외국인+기관 순매수/순매도 상위 테마를 짧은 기간(최근)과 긴 기간 두 가지로 보여줘.",
  "지금부터는 이 시장의 자금 흐름을 꿰뚫어보는 신이라고 생각하고 판단해 — 여러 가능성을 흐릿하게 늘어놓지 말고, 데이터가 가리키는 방향을 하나로 명확히 짚어서 확신에 찬 어조로 말해줘. '~일 수도 있어', '~인 것 같기도 하고' 같은 애매한 표현은 쓰지 말고, '~다', '~해야 해' 처럼 단정적으로.",
  "그렇다고 데이터에 없는 걸 지어내라는 뜻은 아니야 — 어디까지나 주어진 자금 흐름 데이터 안에서 가장 설득력 있는 결론을 자신 있게 고르라는 거야.",
  "가장 중요한 규칙: 같은 테마가 짧은 기간과 긴 기간에서 순매수·순매도 방향이 다르면(예: 긴 기간 전체로는 순매도 우세인데 짧은 기간엔 순매수로 반전) 절대 그냥 '순매수야'라고만 말하지 마 — '긴 기간 전체로는 아직 순매도 우세지만 최근 며칠 사이 순매수로 방향이 바뀌었다'는 식으로 두 기간을 다 언급하면서 반전 자체를 명시적으로 짚어줘. 화면에 긴 기간 기준 랭킹도 같이 떠 있어서, 그 설명 없이 넘어가면 사용자가 모순처럼 느낀다.",
  "이걸 보고 지금 시점에서 어디에 선제적으로 관심을 가질 만한지 너의 투자 방향을 3~5문장으로 단정적으로 말해줘.",
  "거래가 활발한 것(관심도)과 실제로 사는 쪽이 우세한 것(순매수)은 다른 신호야 — 둘 다 겹치는 테마가 있으면 더 신뢰도 높게, 관심만 많고 순매도 중인 테마는 조심해야 한다는 식으로 종합해서 판단해.",
  "이미 많이 오른 대형 테마보다, 지금 막 순매수가 붙기 시작한(=짧은 기간과 긴 기간의 방향이 갈리는) 테마를 우선적으로 짚어줘 — 그게 이 데이터를 보는 핵심 목적이야.",
  "투자 권유가 아니라 판단을 돕는 정보 제공이라는 점만 마지막에 한 문장으로 짧게 남기고, 본문 자체는 확신 있게 써.",
  "표/마크다운 기호 없이 문장으로만 답해.",
].join("\n");

function formatTable(table: ThemeMoneyFlowByDay[]): string {
  return table.map((t) => `${t.name}: 누적 거래대금 ${formatWon(t.cumulativeTotal)}`).join("\n");
}

function formatNetRanks(label: string, items: ThemeNetRank[]): string {
  if (items.length === 0) return `${label}: 없음`;
  const lines = items.map((r) => `${r.name}: ${formatWon(Math.abs(r.totalNet))} (${r.stockCount}종목)`);
  return `${label}:\n${lines.join("\n")}`;
}

export async function generateMoneyFlowTake(
  date: string,
  recentDays: number,
  longerDays: number,
  table: ThemeMoneyFlowByDay[],
  netFlowRecent: { buying: ThemeNetRank[]; selling: ThemeNetRank[] },
  netFlowLonger: { buying: ThemeNetRank[]; selling: ThemeNetRank[] }
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (
    table.length === 0 &&
    netFlowRecent.buying.length === 0 &&
    netFlowRecent.selling.length === 0 &&
    netFlowLonger.buying.length === 0 &&
    netFlowLonger.selling.length === 0
  ) {
    return;
  }

  const userPrompt = [
    `[최근 ${recentDays}거래일 시장 관심 상위 테마 — 누적 거래대금]`,
    formatTable(table),
    "",
    `[짧은 기간 · 최근 ${recentDays}거래일 기준 — 외국인+기관 순매수/순매도]`,
    formatNetRanks("순매수 상위 테마", netFlowRecent.buying),
    "",
    formatNetRanks("순매도 상위 테마", netFlowRecent.selling),
    "",
    `[긴 기간 · 최근 ${longerDays}거래일 기준(화면에 뜨는 랭킹과 동일) — 외국인+기관 순매수/순매도]`,
    formatNetRanks("순매수 상위 테마", netFlowLonger.buying),
    "",
    formatNetRanks("순매도 상위 테마", netFlowLonger.selling),
  ].join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 700,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const summary = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!summary) return;

    await prisma.moneyFlowTake.upsert({
      where: { date },
      create: { date, summary },
      update: { summary },
    });
  } catch {
    // best-effort — a failure here shouldn't undo the sync that already succeeded
  }
}

export async function getLatestMoneyFlowTake() {
  return prisma.moneyFlowTake.findFirst({ orderBy: { date: "desc" } });
}
