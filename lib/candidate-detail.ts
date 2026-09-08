// components/bro/prediction-report.tsx의 "종목 근거" 블록에 인라인으로 펼쳐
// 보여주는 종목별 심층 카드 — 수급/차트/재무/전략 목표가는 전부 실데이터로 계산하고
// (LLM에게 숫자를 맡기지 않음), 사업 요약·시황·대장주 여부처럼 순수 서술이
// 필요한 항목만 한 번의 LLM 호출로 채운다. 후보 5개를 매번 따로 부르지 않고
// 배치로 한 번에 물어봐서 비용/지연을 줄인다.

import Anthropic from "@anthropic-ai/sdk";
import type { CandidatePrediction } from "@/lib/prediction-scoring";
import { fetchKisQuote } from "@/lib/kis-quote";
import { fetchInvestorTrend } from "@/lib/kis-investor-trend";
import { fetchKisChart, type ChartCandle } from "@/lib/kis-chart";
import { fetchFinancialHistoryByCode } from "@/lib/krx-financials";
import { recentIssuesBlock, telegramBlock } from "@/lib/bro-context";
import { prisma } from "@/lib/prisma";
import { formatWon } from "@/lib/format";
import { sentimentVerdict } from "@/lib/sentiment";

// 골구 종목예상 "종목 근거"는 항상 이 7항목 틀로 고정한다 — 시황/거래량/차트/
// 재료/수급/재무/매수타이밍 순서로 번호를 매겨 누가 봐도 같은 순서로 훑을 수
// 있게 하고, 데이터가 없는 항목은 지어내지 않고 그대로 "내용 없음"이라 적는다.
// 항목별 실데이터 소스는 매일 자동으로 갱신되니 이 틀 자체를 건드릴 필요 없이
// 계속 최신 값으로 채워진다. verdicts는 각 항목이 실제로 매수에 우호적인
// 신호인지(O)/아닌지(X)를 실데이터로 판단한 결과 — null은 "판단 불가"(내용
// 없음이거나 중립)라 화면에 O/X를 아예 안 띄운다.
export type CandidateDetail = {
  name: string;
  code?: string;
  themeTags: string[];
  isThemeLeader: boolean;
  businessSummary: string;
  aiReasoning: string; // 4. 재료
  marketContext: string; // 1. 시황
  volumeNote: string; // 2. 거래량
  supplyDemand: string; // 5. 수급
  chartNote: string; // 3. 차트
  financialSummary: string; // 6. 재무
  strategy: {
    support: number | null; // 지지선(실제 차트 지지 레벨)
    resistance: number | null; // 저항선(실제 차트 저항 레벨 = 최근 고점)
    targetPrice: number | null; // 목표가 = max(매수기준가*1.06, 저항선)
    targetPct: number | null;
    stopLossPrice: number | null; // 손절가 = 매수기준가*0.96(고정 -4%)
  };
  verdicts: {
    marketContext: boolean | null; // 1. 시황
    volume: boolean | null; // 2. 거래량
    chart: boolean | null; // 3. 차트
    material: boolean | null; // 4. 재료
    supplyDemand: boolean | null; // 5. 수급
    financial: boolean | null; // 6. 재무
  };
};

const NO_DATA = "내용 없음";
const NO_VERDICTS: CandidateDetail["verdicts"] = {
  marketContext: null,
  volume: null,
  chart: null,
  material: null,
  supplyDemand: null,
  financial: null,
};

// WeeklyPrediction.details에 생성 시점 딱 한 번 저장해둔 JSON을 다시 읽어올
// 때 쓴다 — 형태가 살짝 어긋난 옛 레코드나 파싱 실패는 null로 돌려줘서
// 호출부가 그때만 라이브로 다시 계산하도록 유도한다(완전히 깨지진 않게).
export function parseStoredCandidateDetails(raw: string | null | undefined): CandidateDetail[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // verdicts(O/X 판단)가 추가되기 전에 저장된 옛 레코드는 이 필드가 아예
    // 없다 — 없으면 "판단 불가"(전부 null)로 채워서 화면이 죽지 않게 한다.
    return (parsed as CandidateDetail[]).map((d) => ({ ...d, verdicts: d.verdicts ?? { ...NO_VERDICTS } }));
  } catch {
    return null;
  }
}

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

// 예측이 발행된 그날(forDate)의 종가를 "매수 기준가"로 고정한다 — 이후
// getDailyChangeSeries(lib/candidate-tracking.ts)도 정확히 같은 기준(forDate
// 당일 또는 그 다음 첫 거래일 종가)으로 누적 수익률을 계산하니, 목표가/손절가도
// 반드시 이 값에서 뽑아야 서로 어긋나지 않는다. 예전엔 실시간 시세(quote)를
// 우선 썼는데, 그 값을 나중에(며칠 뒤) 다시 계산하면 "지금" 시세가 되어버려서
// 손절선이 주가를 계속 쫓아 내려가며 절대 안 잡히는 문제가 있었다(예:
// 금호건설 — 2일차에 이미 -5.9%로 -4% 손절선을 넘었는데도 며칠 뒤 다시 계산한
// 손절가가 그새 떨어진 시세 기준으로 다시 낮게 잡혀서 "도달"이 안 뜸). 이제는
// 언제 계산하든 항상 forDate 당일 종가로 고정된 같은 값이 나온다.
function anchorPrice(candles: ChartCandle[], forDate: string): number | null {
  const idx = candles.findIndex((c) => c.date >= forDate);
  if (idx !== -1) return candles[idx].close;
  return candles.length > 0 ? candles[candles.length - 1].close : null;
}

// 실데이터 기반 — 5일선/20일선 대비 현재가 위치를 그대로 문장으로 옮길
// 뿐이라 매일 계산해도 늘 사실과 일치한다. lib/money-flow-take.ts도 추천
// 종목의 차트 근거를 붙일 때 이 함수를 그대로 재사용한다 — 같은 계산을 두
// 곳에서 따로 구현하면 언젠가 서로 다른 말을 하게 된다. positive는 "지금
// 매수하기에 우호적인 차트 모양인가"를 뜻한다(5일선 기준 위인지).
export function buildChartNote(
  closes: number[]
): { note: string; recentHigh: number | null; support: number | null; positive: boolean | null } {
  if (closes.length < 5) return { note: NO_DATA, recentHigh: null, support: null, positive: null };

  const current = closes[closes.length - 1];
  const s5 = sma(closes, 5);
  const s20 = sma(closes, 20);
  // 최근 20거래일(약 1개월) 고점/저점만 본다 — 이번 주 예측 성격상 "목표 구간"은
  // 단기 관찰이지 몇 달 전 급등 고점까지 끌어올 이유가 없다.
  const window = closes.slice(-20);
  const recentHigh = Math.max(...window);
  const support = s20 ?? Math.min(...window);

  let note: string;
  let positive: boolean | null;
  if (s5 === null) {
    note = NO_DATA;
    positive = null;
  } else if (s20 === null) {
    note = current >= s5 ? "5일선 위에서 움직이는 중" : "5일선 아래로 내려온 상태";
    positive = current >= s5;
  } else if (current >= s5 && current >= s20) {
    note = "5일선·20일선 모두 위에서 상승 흐름 유지 중";
    positive = true;
  } else if (current < s5 && current >= s20) {
    note = "5일선은 이탈했지만 20일선 지지를 보고 있는 구간";
    positive = true;
  } else if (current < s5 && current < s20) {
    note = "5일선·20일선 모두 이탈, 추세 약화 구간";
    positive = false;
  } else {
    note = "5일선은 위, 20일선은 아래 — 단기 변동성 구간";
    positive = false;
  }

  return { note, recentHigh, support, positive };
}

// 500%(5배) 이상 전일 대비 거래량 급증 — lib/technical-signals.ts의 "거래량
// 폭증" 시그널과 같은 기준. 그쪽은 "오늘"만 판단하지만, 여기선 지지/저항
// 터치 지점처럼 화면에 보이는 기간 전체에서 몇 번이나 있었는지 다 표시한다.
export function findVolumeSpikes(candles: { date: string; volume: number }[]): string[] {
  const dates: string[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].volume;
    if (prev > 0 && candles[i].volume / prev >= 5) dates.push(candles[i].date);
  }
  return dates;
}

// 실데이터 기반 — "원래 평균 얼마였는데 최근 5거래일 거래량이 몇% 늘었는지"를
// 그대로 계산한다. 최근 5거래일은 비교 대상에서 빼고 그 직전 20거래일을
// "평소" 기준으로 삼는다 — lib/weekly-prediction.ts의 종목 선정 단계에서도
// 그대로 재사용해서 선정 근거와 상세 카드가 같은 숫자를 말하게 한다.
// positive는 평소보다 늘었으면(시장 관심 증가) true.
export function buildVolumeNote(candles: { volume: number }[]): { note: string; positive: boolean | null } {
  if (candles.length < 10) return { note: NO_DATA, positive: null };

  const recent = candles.slice(-5);
  const recentAvg = recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;

  const baseline = candles.slice(0, -5).slice(-20);
  if (baseline.length === 0) return { note: NO_DATA, positive: null };
  const baselineAvg = baseline.reduce((sum, c) => sum + c.volume, 0) / baseline.length;
  if (baselineAvg <= 0) return { note: NO_DATA, positive: null };

  const pct = ((recentAvg - baselineAvg) / baselineAvg) * 100;
  const dir = pct >= 0 ? "증가" : "감소";
  const note = `평소(직전 ${baseline.length}거래일) 평균 ${Math.round(baselineAvg).toLocaleString()}주 → 최근 5거래일 평균 ${Math.round(recentAvg).toLocaleString()}주 (${Math.abs(pct).toFixed(0)}% ${dir})`;
  return { note, positive: pct >= 0 };
}

// 실데이터 기반 — 최근 5거래일 연속 순매수 일수 + 누적 금액. positive는
// 외국인/기관 중 최소 한쪽이라도 순매수 우위면 true, 둘 다 매도 우위면 false.
function buildSupplyDemandNote(
  rows: { foreign: number; institution: number }[]
): { note: string; positive: boolean | null } {
  if (rows.length === 0) return { note: NO_DATA, positive: null };

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

  const score = Math.sign(foreignStreak) + Math.sign(institutionSum5);
  return { note: `${foreignPart} / ${institutionPart}`, positive: score > 0 ? true : score < 0 ? false : null };
}

// 실데이터 기반 — 최근 완결된 회계연도 기준 전년 대비. data.go.kr 재무 서비스가
// 연간 실적만 제공해서(분기 X) "전분기 대비"가 아니라 "전년 대비"로 계산한다.
// positive는 영업이익/순이익 둘 다 흑자인지(적자 없는지) — 매출 증감 방향과는
// 별개로, "적자 아닌지 유무"를 그대로 기준으로 삼는다.
function buildFinancialSummary(
  history: { year: number; revenue: number; operatingProfit: number; netIncome: number }[]
): { summary: string; positive: boolean | null } {
  if (history.length === 0) return { summary: NO_DATA, positive: null };
  const latest = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;

  const revenuePart = prev && prev.revenue > 0
    ? `매출액 전년대비 ${(((latest.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1)}% ${
        latest.revenue >= prev.revenue ? "증가" : "감소"
      }`
    : `매출액 ${formatWon(latest.revenue)}(${latest.year}년)`;

  const opPart = `영업이익 ${latest.operatingProfit >= 0 ? "흑자" : "적자"}`;
  const netPart = `순이익 ${latest.netIncome >= 0 ? "흑자" : "적자"}`;

  return {
    summary: `${revenuePart}, ${opPart}, ${netPart} (${latest.year}년 기준)`,
    positive: latest.operatingProfit >= 0 && latest.netIncome >= 0,
  };
}

type GroundedInput = {
  candidate: CandidatePrediction;
  sector?: string;
  theme?: string;
  chart: { note: string; recentHigh: number | null; support: number | null; positive: boolean | null };
  volumeNote: { note: string; positive: boolean | null };
  supplyDemand: { note: string; positive: boolean | null };
  financials: { summary: string; positive: boolean | null };
  currentPrice: number | null;
};

type LlmOutput = {
  name: string;
  businessSummary: string;
  marketContext: string;
  marketContextPositive: boolean | null;
  isThemeLeader: boolean;
};

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
    "너는 한국 주식시장 애널리스트야. 아래 종목별로 네 가지만 짧게 채워줘:",
    "1) businessSummary: 이 회사가 뭐 하는 회사인지 한 문장 사업 요약",
    "2) marketContext: 최근 이슈/뉴스 흐름 중 이 종목과 관련된 시황을 반말로 한 문장 (데이터에 없으면 일반적인 섹터 흐름으로)",
    "3) marketContextPositive: 지금 이 섹터/시황이 실제로 매수하기에 우호적으로 주목받고 있으면 true, 애매하거나 오히려 부정적이면 false — 판단이 정말 안 서면 null",
    "4) isThemeLeader: 같이 언급된 테마 안에서 이 종목이 대표주(대장주)로 볼 만하면 true, 아니면 false",
    "확정적 보장이 아니라 관찰이라는 톤을 유지하고, 모르는 건 지어내지 마.",
    "다른 설명 없이 JSON 배열로만 답해: [{\"name\":\"종목명\",\"businessSummary\":\"...\",\"marketContext\":\"...\",\"marketContextPositive\":true,\"isThemeLeader\":true}]",
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
            marketContextPositive: typeof row.marketContextPositive === "boolean" ? row.marketContextPositive : null,
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

// forDate: 이 후보들이 발행된 예측의 기준일("오늘 종가에 매수했다고 가정"하는
// 그 날짜) — 매수타이밍(목표가/손절가)의 기준 시세를 정확히 이 날짜 종가로
// 고정하기 위해 반드시 필요하다(anchorPrice 주석 참고). 생성 당일 바로
// 호출되면 forDate는 사실상 "오늘"이라 기존과 동작이 같고, 옛 레코드를 나중에
// (라이브 폴백으로) 다시 계산할 때만 차이가 난다.
export async function getCandidateDetails(
  candidates: CandidatePrediction[],
  forDate: string
): Promise<CandidateDetail[]> {
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
    volumeNote: buildVolumeNote(charts[i]),
    supplyDemand: buildSupplyDemandNote(trends[i]),
    financials: buildFinancialSummary(financials[i]),
    // forDate 당일(또는 그 직후 첫 거래일) 종가를 매수 기준가로 고정 —
    // 실시간 시세(quotes)는 더 이상 기준가로 안 쓴다(anchorPrice 주석 참고).
    // 그래도 차트에 forDate 데이터가 전혀 없는 극히 드문 경우에만 실시간
    // 시세로 폴백한다.
    currentPrice: anchorPrice(charts[i], forDate) ?? quotes[i]?.price ?? null,
  }));

  const narratives = await synthesizeNarratives(grounded);

  const detailsByName = new Map<string, CandidateDetail>();
  for (const g of grounded) {
    const llm = narratives.get(g.candidate.name);
    const currentPrice = g.currentPrice;
    // 매수타이밍(7번)은 항상 같은 규칙: 목표가는 최소 +6% 기대수익을 보장하고
    // (저항선이 매수 기준가보다 낮거나 5% 미만 위쪽이면 저항선 대신 +6%를
    // 씀), 손절가는 매수 기준가 대비 고정 -4% — 둘 다 LLM 추측이 아니라 규칙
    // 기반 값. 지지선/저항선 자체는 buildChartNote가 계산한 실제 차트
    // 레벨을 그대로 보여준다.
    const target =
      currentPrice !== null && currentPrice > 0
        ? Math.max(currentPrice * 1.06, g.chart.recentHigh ?? 0)
        : null;
    const stopLoss = currentPrice !== null && currentPrice > 0 ? currentPrice * 0.96 : null;
    detailsByName.set(g.candidate.name, {
      name: g.candidate.name,
      code: g.candidate.code,
      themeTags: [g.sector, g.theme].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i),
      isThemeLeader: llm?.isThemeLeader ?? false,
      businessSummary: llm?.businessSummary || NO_DATA,
      aiReasoning: g.candidate.reasoning || NO_DATA,
      marketContext: llm?.marketContext || NO_DATA,
      volumeNote: g.volumeNote.note,
      supplyDemand: g.supplyDemand.note,
      chartNote: g.chart.note,
      financialSummary: g.financials.summary,
      strategy: {
        support: g.chart.support,
        resistance: g.chart.recentHigh,
        targetPrice: target,
        targetPct: target !== null && currentPrice ? ((target - currentPrice) / currentPrice) * 100 : null,
        stopLossPrice: stopLoss,
      },
      verdicts: {
        marketContext: llm?.marketContextPositive ?? null,
        volume: g.volumeNote.positive,
        chart: g.chart.positive,
        material: sentimentVerdict(g.candidate.reasoning),
        supplyDemand: g.supplyDemand.positive,
        financial: g.financials.positive,
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
        businessSummary: NO_DATA,
        aiReasoning: c.reasoning || NO_DATA,
        marketContext: NO_DATA,
        volumeNote: NO_DATA,
        supplyDemand: NO_DATA,
        chartNote: NO_DATA,
        financialSummary: NO_DATA,
        strategy: { support: null, resistance: null, targetPrice: null, targetPct: null, stopLossPrice: null },
        verdicts: { ...NO_VERDICTS, material: sentimentVerdict(c.reasoning) },
      }
  );
}
