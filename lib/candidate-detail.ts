// components/bro/prediction-report.tsx의 "종목 근거" 블록에 인라인으로 펼쳐
// 보여주는 종목별 심층 카드 — 수급/차트/재무/전략 목표가는 전부 실데이터로 계산하고
// (LLM에게 숫자를 맡기지 않음), 사업 요약·시황·대장주 여부처럼 순수 서술이
// 필요한 항목만 한 번의 LLM 호출로 채운다. 후보 5개를 매번 따로 부르지 않고
// 배치로 한 번에 물어봐서 비용/지연을 줄인다.

import Anthropic from "@anthropic-ai/sdk";
import type { CandidatePrediction } from "@/lib/prediction-scoring";
import { fetchKisQuote } from "@/lib/kis-quote";
import { fetchInvestorTrend } from "@/lib/kis-investor-trend";
import { fetchKisChart } from "@/lib/kis-chart";
import { fetchFinancialHistoryByCode } from "@/lib/krx-financials";
import { recentIssuesBlock, telegramBlock } from "@/lib/bro-context";
import { prisma } from "@/lib/prisma";
import { formatWon } from "@/lib/format";

export type CandidateDetail = {
  name: string;
  code?: string;
  themeTags: string[];
  isThemeLeader: boolean;
  businessSummary: string;
  aiReasoning: string;
  marketContext: string;
  supplyDemand: string;
  chartNote: string;
  financialSummary: string;
  strategy: {
    targetPrice: number | null;
    targetPct: number | null;
    stopLossPrice: number | null;
  };
};

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

// 실데이터 기반 — LLM이 손대지 않는다. 5일선/20일선 대비 현재가 위치를 그대로
// 문장으로 옮길 뿐이라 매일 계산해도 늘 사실과 일치한다.
function buildChartNote(closes: number[]): { note: string; recentHigh: number | null; support: number | null } {
  if (closes.length < 5) return { note: "차트 데이터가 아직 부족해요.", recentHigh: null, support: null };

  const current = closes[closes.length - 1];
  const s5 = sma(closes, 5);
  const s20 = sma(closes, 20);
  // 최근 20거래일(약 1개월) 고점/저점만 본다 — 이번 주 예측 성격상 "목표 구간"은
  // 단기 관찰이지 몇 달 전 급등 고점까지 끌어올 이유가 없다.
  const window = closes.slice(-20);
  const recentHigh = Math.max(...window);
  const support = s20 ?? Math.min(...window);

  let note: string;
  if (s5 === null) {
    note = "5일선을 계산하기엔 데이터가 부족해요.";
  } else if (s20 === null) {
    note = current >= s5 ? "5일선 위에서 움직이는 중" : "5일선 아래로 내려온 상태";
  } else if (current >= s5 && current >= s20) {
    note = "5일선·20일선 모두 위에서 상승 흐름 유지 중";
  } else if (current < s5 && current >= s20) {
    note = "5일선은 이탈했지만 20일선 지지를 보고 있는 구간";
  } else if (current < s5 && current < s20) {
    note = "5일선·20일선 모두 이탈, 추세 약화 구간";
  } else {
    note = "5일선은 위, 20일선은 아래 — 단기 변동성 구간";
  }

  return { note, recentHigh, support };
}

// 실데이터 기반 — 최근 5거래일 연속 순매수 일수 + 누적 금액.
function buildSupplyDemandNote(rows: { foreign: number; institution: number }[]): string {
  if (rows.length === 0) return "수급 데이터를 가져오지 못했어요.";

  function streak(pick: (r: { foreign: number; institution: number }) => number): number {
    let n = 0;
    const sign = Math.sign(pick(rows[0]));
    if (sign === 0) return 0;
    for (const r of rows) {
      if (Math.sign(pick(r)) === sign) n++;
      else break;
    }
    return sign > 0 ? n : -n;
  }

  const foreignStreak = streak((r) => r.foreign);
  const institutionSum5 = rows.slice(0, 5).reduce((sum, r) => sum + r.institution, 0);

  const foreignPart =
    foreignStreak === 0
      ? "외국인 순매수/순매도 전환 구간"
      : foreignStreak > 0
        ? `외국인 ${foreignStreak}일 연속 순매수`
        : `외국인 ${Math.abs(foreignStreak)}일 연속 순매도`;

  const institutionPart = `기관 ${rows.length >= 5 ? "5일" : `${rows.length}일`} 누적 ${
    institutionSum5 >= 0 ? formatWon(institutionSum5) : `-${formatWon(Math.abs(institutionSum5))}`
  } ${institutionSum5 >= 0 ? "매수" : "매도"}`;

  return `${foreignPart} / ${institutionPart}`;
}

// 실데이터 기반 — 최근 완결된 회계연도 기준 전년 대비. data.go.kr 재무 서비스가
// 연간 실적만 제공해서(분기 X) "전분기 대비"가 아니라 "전년 대비"로 계산한다.
function buildFinancialSummary(
  history: { year: number; revenue: number; operatingProfit: number; netIncome: number }[]
): string {
  if (history.length === 0) return "재무 데이터를 확인하지 못했어요.";
  const latest = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;

  const revenuePart = prev && prev.revenue > 0
    ? `매출액 전년대비 ${(((latest.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1)}% ${
        latest.revenue >= prev.revenue ? "증가" : "감소"
      }`
    : `매출액 ${formatWon(latest.revenue)}(${latest.year}년)`;

  const opPart = `영업이익 ${latest.operatingProfit >= 0 ? "흑자" : "적자"}`;
  const netPart = `순이익 ${latest.netIncome >= 0 ? "흑자" : "적자"}`;

  return `${revenuePart}, ${opPart}, ${netPart} (${latest.year}년 기준)`;
}

type GroundedInput = {
  candidate: CandidatePrediction;
  sector?: string;
  theme?: string;
  chart: { note: string; recentHigh: number | null; support: number | null };
  supplyDemand: string;
  financials: string;
  currentPrice: number | null;
};

type LlmOutput = { name: string; businessSummary: string; marketContext: string; isThemeLeader: boolean };

async function synthesizeNarratives(inputs: GroundedInput[]): Promise<Map<string, LlmOutput>> {
  const result = new Map<string, LlmOutput>();
  if (!process.env.ANTHROPIC_API_KEY || inputs.length === 0) return result;

  const [issuesBlock, tgBlock] = await Promise.all([recentIssuesBlock(10), telegramBlock()]);

  const stockBlocks = inputs
    .map(
      (i) =>
        `- ${i.candidate.name}${i.sector ? ` (섹터: ${i.sector}${i.theme ? `, 테마: ${i.theme}` : ""})` : ""}: 예측 근거 "${i.candidate.reasoning}"`
    )
    .join("\n");

  const system = [
    "너는 한국 주식시장 애널리스트야. 아래 종목별로 세 가지만 짧게 채워줘:",
    "1) businessSummary: 이 회사가 뭐 하는 회사인지 한 문장 사업 요약",
    "2) marketContext: 최근 이슈/뉴스 흐름 중 이 종목과 관련된 시황을 반말로 한 문장 (데이터에 없으면 일반적인 섹터 흐름으로)",
    "3) isThemeLeader: 같이 언급된 테마 안에서 이 종목이 대표주(대장주)로 볼 만하면 true, 아니면 false",
    "확정적 보장이 아니라 관찰이라는 톤을 유지하고, 모르는 건 지어내지 마.",
    "다른 설명 없이 JSON 배열로만 답해: [{\"name\":\"종목명\",\"businessSummary\":\"...\",\"marketContext\":\"...\",\"isThemeLeader\":true}]",
  ].join("\n");

  const userPrompt = [stockBlocks, issuesBlock, tgBlock].filter(Boolean).join("\n\n");

  const client = new Anthropic();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1200,
        output_config: { effort: "low" },
        system,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return result;
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return result;
      for (const row of parsed) {
        if (typeof row?.name === "string") {
          result.set(row.name, {
            name: row.name,
            businessSummary: typeof row.businessSummary === "string" ? row.businessSummary : "",
            marketContext: typeof row.marketContext === "string" ? row.marketContext : "",
            isThemeLeader: row.isThemeLeader === true,
          });
        }
      }
      return result;
    } catch (e) {
      const overloaded = e instanceof Anthropic.APIError && (e.status === 429 || e.status === 529 || e.status === 500);
      if (overloaded && attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return result;
    }
  }
  return result;
}

export async function getCandidateDetails(candidates: CandidatePrediction[]): Promise<CandidateDetail[]> {
  const withCode = candidates.filter((c) => c.code);

  const [quotes, trends, charts, financials, themes] = await Promise.all([
    Promise.all(withCode.map((c) => fetchKisQuote(c.code!))),
    Promise.all(withCode.map((c) => fetchInvestorTrend(c.code!, 5))),
    Promise.all(withCode.map((c) => fetchKisChart(c.code!, "D"))),
    Promise.all(
      withCode.map((c) => {
        const nowYear = Number(
          new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date())
        );
        return fetchFinancialHistoryByCode(c.code!, [nowYear - 2, nowYear - 1]);
      })
    ),
    prisma.stockTheme.findMany({ where: { name: { in: withCode.map((c) => c.name) } } }),
  ]);

  const themeByName = new Map(themes.map((t) => [t.name, t.theme]));

  const grounded: GroundedInput[] = withCode.map((c, i) => ({
    candidate: c,
    sector: quotes[i]?.sector,
    theme: themeByName.get(c.name),
    chart: buildChartNote(charts[i].map((k) => k.close)),
    supplyDemand: buildSupplyDemandNote(trends[i]),
    financials: buildFinancialSummary(financials[i]),
    currentPrice: quotes[i]?.price ?? (charts[i].length > 0 ? charts[i][charts[i].length - 1].close : null),
  }));

  const narratives = await synthesizeNarratives(grounded);

  const detailsByName = new Map<string, CandidateDetail>();
  for (const g of grounded) {
    const llm = narratives.get(g.candidate.name);
    const currentPrice = g.currentPrice;
    // 최근 고점이 현재가보다 낮으면(이미 신고가 갱신 중) 저항선 역할을 못 하니,
    // 그럴 땐 현재가 대비 보수적인 +5%를 대신 쓴다 — 이 경우도 LLM 추측이 아니라
    // 규칙 기반 값.
    const target =
      g.chart.recentHigh !== null && currentPrice !== null && g.chart.recentHigh > currentPrice
        ? g.chart.recentHigh
        : currentPrice !== null
          ? currentPrice * 1.05
          : null;
    detailsByName.set(g.candidate.name, {
      name: g.candidate.name,
      code: g.candidate.code,
      themeTags: [g.sector, g.theme].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i),
      isThemeLeader: llm?.isThemeLeader ?? false,
      businessSummary: llm?.businessSummary || "사업 정보를 아직 확인하지 못했어요.",
      aiReasoning: g.candidate.reasoning,
      marketContext: llm?.marketContext || "최근 관련 시황 정보가 부족해요.",
      supplyDemand: g.supplyDemand,
      chartNote: g.chart.note,
      financialSummary: g.financials,
      strategy: {
        targetPrice: target,
        targetPct: target !== null && currentPrice ? ((target - currentPrice) / currentPrice) * 100 : null,
        stopLossPrice: g.chart.support,
      },
    });
  }

  // 코드가 안 붙은 후보(신규 상장 등 자동 매칭 실패)는 실데이터 없이 이름/근거만.
  return candidates.map(
    (c) =>
      detailsByName.get(c.name) ?? {
        name: c.name,
        code: c.code,
        themeTags: [],
        isThemeLeader: false,
        businessSummary: "종목코드가 확인되지 않아 상세 정보를 불러오지 못했어요.",
        aiReasoning: c.reasoning,
        marketContext: "-",
        supplyDemand: "-",
        chartNote: "-",
        financialSummary: "-",
        strategy: { targetPrice: null, targetPct: null, stopLossPrice: null },
      }
  );
}
