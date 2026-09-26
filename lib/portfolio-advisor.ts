// 둥지(My Page)의 "AI 골구 리밸런싱 어드바이저" — 현재 자산 배분(목표 대비
// 실제 비중)과 보유 종목 손익 상태, 오늘의 시장 데이터를 종합해 리밸런싱
// 방향을 제안하는 LLM 호출 1건. lib/weekly-prediction.ts와 달리 매일
// 자동으로 도는 크론이 아니라 사용자가 둥지 페이지를 열 때 그때그때 호출되는
// 요청형 API(app/api/portfolio/advice)라서, 결과를 DB에 영구 저장하지
// 않는다 — 보유 종목/현금은 사용자가 언제든 바꿀 수 있어 "오늘자 하나의
// 정답"이 의미 없다.

import Anthropic from "@anthropic-ai/sdk";
import { marketDataBlock } from "@/lib/bro-context";
import type { PortfolioOverview } from "@/lib/portfolio";
import type { AssessmentReport } from "@/lib/holding-assessment-store";
import { STATE_ICON } from "@/lib/holding-assessment";
import { formatChg, formatWon } from "@/lib/format";

// 판정·숫자는 lib/holding-assessment.ts가 코드로 계산한 확정값이고, 이 LLM 호출은
// 그 결과를 쉬운 말로 풀어 설명만 한다(직접 계산/판정/수치 창작 금지).
const SYSTEM_PROMPT = [
  "너는 한국 주식시장에 밝은 개인 포트폴리오 어드바이저 '골구'야. 친한 형/친구처럼 편한 반말로, 짧고 명확하게 말해.",
  "[내 포트폴리오 현황]의 자산 비중, [종목별 규칙 판정]의 판정·신호·경고는 이미 코드가 계산한 확정 결과야. 너는 그 숫자와 판정을 바꾸거나 새로 계산하지 말고, 왜 그렇게 나왔는지 쉬운 말로 풀어서 설명만 해.",
  "주어진 데이터에 없는 수치(목표가, 확률, 미래 주가 등)는 절대 지어내지 마. 근거가 없으면 '데이터로는 알 수 없다'고 해.",
  "손실률만 보고 팔라고 하지 마. 원금 회복에 필요한 수익률이 크다는 점과 판정 신호(차트·수급·거래량·재무)를 같이 짚어줘. 확정적 매수/매도 지시가 아니라 관찰과 제안 톤을 유지해.",
  "[오늘의 시장 데이터]는 배경 참고용이야. 판정을 뒤집는 근거로 쓰지 마.",
  "중요한 문장이나 핵심 수치는 **이렇게** 별 두 개로 감싸서 강조해.",
  "다른 설명 없이 아래 JSON 형식으로만 답해:",
  '{"summary": "전체 진단 2-3문장", "suggestions": [{"action": "구체적 행동 한 문장(예: 정밀점검 종목 ○○의 실적 공시부터 확인)", "reason": "근거 한 문장(규칙 판정 결과 인용)"}] (2-4개)}',
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

function assessmentBlock(report: AssessmentReport | null): string {
  if (!report || report.assessments.length === 0) return "";
  const lines = ["[종목별 규칙 판정]"];
  for (const a of report.assessments) {
    const parts = [`${STATE_ICON[a.state]} ${a.name}: ${a.state}`];
    if (a.changePct !== null) parts.push(`매수가 대비 ${formatChg(a.changePct)}`);
    if (a.recoveryNeededPct !== null) parts.push(`원금 회복 필요 +${a.recoveryNeededPct.toFixed(1)}%`);
    if (a.weightPct !== null) parts.push(`비중 ${a.weightPct.toFixed(1)}%`);
    lines.push(`- ${parts.join(" · ")}`);
    lines.push(`  신호: ${a.signals.map((x) => `${x.label}(${x.note})`).join(" / ")}`);
    const change = report.history[a.code]?.lastChange;
    if (change) lines.push(`  이전 판정: ${change.fromDate} ${change.fromState}`);
  }
  if (report.flags.length > 0) {
    lines.push("", "[포트폴리오 경고]");
    for (const f of report.flags) lines.push(`- ${f.text}`);
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
  report: AssessmentReport | null
): Promise<PortfolioAdvice | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const [marketBlock] = await Promise.all([marketDataBlock()]);
  const userPrompt = [overviewBlock(overview), assessmentBlock(report), marketBlock].filter(Boolean).join("\n\n");

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
