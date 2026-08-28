// 둥지(My Page)의 "AI 골구 리밸런싱 어드바이저" — 현재 자산 배분(목표 대비
// 실제 비중)과 보유 종목 손익 상태, 오늘의 시장 데이터를 종합해 리밸런싱
// 방향을 제안하는 LLM 호출 1건. lib/weekly-prediction.ts와 달리 매일
// 자동으로 도는 크론이 아니라 사용자가 둥지 페이지를 열 때 그때그때 호출되는
// 요청형 API(app/api/portfolio/advice)라서, 결과를 DB에 영구 저장하지
// 않는다 — 보유 종목/현금은 사용자가 언제든 바꿀 수 있어 "오늘자 하나의
// 정답"이 의미 없다.

import Anthropic from "@anthropic-ai/sdk";
import { marketDataBlock } from "@/lib/bro-context";
import type { PortfolioOverview, HoldingWithLiveData } from "@/lib/portfolio";
import { formatChg, formatWon } from "@/lib/format";

const SYSTEM_PROMPT = [
  "너는 한국 주식시장에 밝은 개인 포트폴리오 어드바이저 '골구'야. 친한 형/친구처럼 편한 반말로, 짧고 명확하게 조언해.",
  "아래 [내 포트폴리오 현황]에서 목표 비중 대비 실제 비중이 얼마나 벌어졌는지, [보유 종목 상태]에서 손절가 근접/이탈 종목이 있는지, [오늘의 시장 데이터]를 종합해서 리밸런싱 방향을 제안해.",
  "확정적 매수/매도 지시가 아니라 데이터에 근거한 관찰과 제안이라는 톤을 유지해. 손절가 이탈/근접 종목이 있으면 반드시 짚어줘.",
  "중요한 문장이나 핵심 수치는 **이렇게** 별 두 개로 감싸서 강조해.",
  "다른 설명 없이 아래 JSON 형식으로만 답해:",
  '{"summary": "전체 진단 2-3문장", "suggestions": [{"action": "구체적 행동 한 문장(예: 채권 비중 5%p 확대 검토)", "reason": "근거 한 문장"}] (2-4개)}',
].join("\n");

function overviewBlock(overview: PortfolioOverview): string {
  const lines = [
    `[내 포트폴리오 현황]`,
    `총 시드 ${formatWon(overview.totalSeed)} · 총 평가액 ${formatWon(overview.totalValuation)}` +
      (overview.profitPct !== null ? ` (${formatChg(overview.profitPct)})` : ""),
  ];
  for (const a of overview.allocation) {
    const diff = a.pct - a.targetPct;
    lines.push(
      `- ${a.label}: 현재 ${a.pct.toFixed(1)}% (목표 ${a.targetPct.toFixed(1)}%, ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%p)`
    );
  }
  return lines.join("\n");
}

function holdingsBlock(holdings: HoldingWithLiveData[]): string {
  if (holdings.length === 0) return "";
  const lines = ["[보유 종목 상태]"];
  for (const h of holdings) {
    const parts = [h.name];
    if (h.changePct !== null) parts.push(`매수가 대비 ${formatChg(h.changePct)}`);
    if (h.riskStatus) parts.push(`상태: ${h.riskStatus}`);
    lines.push(`- ${parts.join(" · ")}`);
  }
  return lines.join("\n");
}

export type PortfolioAdvice = {
  summary: string;
  suggestions: { action: string; reason: string }[];
};

function parseAdvice(text: string): PortfolioAdvice | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter(
          (s: unknown): s is { action: string; reason: string } =>
            !!s && typeof s === "object" && typeof (s as any).action === "string" && typeof (s as any).reason === "string"
        )
      : [];
    return { summary: parsed.summary, suggestions };
  } catch {
    return null;
  }
}

export async function generatePortfolioAdvice(
  overview: PortfolioOverview,
  holdings: HoldingWithLiveData[]
): Promise<PortfolioAdvice | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const [marketBlock] = await Promise.all([marketDataBlock()]);
  const userPrompt = [overviewBlock(overview), holdingsBlock(holdings), marketBlock].filter(Boolean).join("\n\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1200,
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return parseAdvice(text);
}
