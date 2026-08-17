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
  "아래 데이터는 최근 며칠간 테마별 거래대금(시장 관심도) 누적 순위와, 외국인+기관 순매수/순매도 상위 테마 목록이야.",
  "이걸 보고 지금 시점에서 어디에 선제적으로 관심을 가질 만한지 너의 개인적인 투자 방향을 3~4문장으로 말해줘.",
  "거래가 활발한 것(관심도)과 실제로 사는 쪽이 우세한 것(순매수)은 다른 신호야 — 둘 다 겹치는 테마가 있으면 더 신뢰도 높게, 관심만 많고 순매도 중인 테마는 조심해야 한다는 식으로 종합해서 판단해.",
  "이미 많이 오른 대형 테마보다, 지금 막 순매수가 붙기 시작한 테마를 우선적으로 짚어줘 — 그게 이 데이터를 보는 목적이야.",
  "확정된 전망이 아니라 참고 의견이라는 걸 자연스럽게 남기고, 투자 권유가 아니라 판단을 돕는 정보 제공이라는 점을 지켜.",
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
  daysCount: number,
  table: ThemeMoneyFlowByDay[],
  netFlow: { buying: ThemeNetRank[]; selling: ThemeNetRank[] }
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (table.length === 0 && netFlow.buying.length === 0 && netFlow.selling.length === 0) return;

  const userPrompt = [
    `[최근 ${daysCount}거래일 시장 관심 상위 테마 — 누적 거래대금]`,
    formatTable(table),
    "",
    formatNetRanks("[순매수 상위 테마 — 외국인+기관 누적 순매수]", netFlow.buying),
    "",
    formatNetRanks("[순매도 상위 테마 — 외국인+기관 누적 순매도]", netFlow.selling),
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
