// 골구 종목 근거의 7항목(사업요약/시황/거래량/차트/재료/수급/재무) 각각을
// 클릭했을 때 여는 "전문분석가 수준" 심층 모달의 데이터 계층. 항목별 요약
// 한 줄(components/bro/detail-card.tsx)과 달리 여기는 그 항목 하나에만
// 집중해서 실데이터를 최대한 끌어모으고, 서술이 필요한 곳만 LLM 한 번으로
// 채운다 — 클릭할 때만 불러오는 지연 로딩이라(components/stock/golgoo-panel.tsx
// 등 이미 쓰는 패턴과 동일) 후보 5개 x 7항목을 미리 다 계산해두지 않는다.

import Anthropic from "@anthropic-ai/sdk";
import { fetchKisChart, type ChartCandle } from "@/lib/kis-chart";
import { fetchInvestorTrend, type InvestorTrendRow } from "@/lib/kis-investor-trend";
import { fetchFinancialHistoryByCode, type YearlyFinancials } from "@/lib/krx-financials";
import { fetchNews, type NewsItem } from "@/lib/naver-news";
import { recentIssuesBlock, telegramBlock, marketDataBlock } from "@/lib/bro-context";
import {
  computeTechnicalSignals,
  findSupportResistanceLevels,
  nearestSupportResistance,
  buildChartStory,
  LONG_TERM_SIGNAL_CANDLES,
  type TechnicalSignal,
  type SupportResistanceLevel,
  type ChartStoryAnnotation,
} from "@/lib/technical-signals";

export type FieldKey = "business" | "market" | "volume" | "chart" | "material" | "supply" | "financial";

async function llmWrite(system: string, userPrompt: string, maxTokens = 900): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

// 1. 사업 요약 — 전문 애널리스트가 쓰는 기업 개요 수준의 자세한 설명.
export type BusinessDetail = { content: string };

export async function getBusinessDetail(name: string, code: string): Promise<BusinessDetail> {
  // "주가"를 덧붙여 검색 — "후성"처럼 흔한 단어 조각(후성유전학 등)과 겹치는
  // 종목명이 실제로 있어서(라이브 검증으로 발견), 그냥 종목명만 검색하면
  // 전혀 무관한 기사가 섞여 들어온다.
  const news = await fetchNews(`${name} 주가`, 5);
  const newsBlock = news.length > 0 ? news.map((n) => `- ${n.title}: ${n.description}`).join("\n") : "관련 뉴스 없음";

  const system = [
    "너는 한국 주식시장 섹터 전문 애널리스트야. 아래 종목의 사업 내용을 4~6문장으로 자세히 설명해줘.",
    "주요 사업부문·매출 구조, 핵심 제품/서비스, 산업 내 위치(경쟁사 대비), 최근 사업 관련 동향까지 포함해.",
    "확실하지 않은 수치는 지어내지 말고 일반적으로 알려진 사실 위주로, 반말로 편하게 써.",
    "다른 설명 없이 본문만 답해.",
  ].join("\n");
  const content = await llmWrite(system, `종목: ${name} (${code})\n\n[관련 최근 뉴스]\n${newsBlock}`);
  return { content: content ?? "사업 정보를 지금은 자세히 불러오지 못했어요." };
}

// 2. 시황 — 지금 이 종목/섹터를 둘러싼 시장 상황을 골구가 깊게 분석.
export type MarketDetail = { content: string };

export async function getMarketDetail(name: string, reasoning: string): Promise<MarketDetail> {
  const [marketBlock, issuesBlock, tgBlock] = await Promise.all([
    marketDataBlock(),
    recentIssuesBlock(20),
    telegramBlock(),
  ]);

  const system = [
    "너는 개인 투자 AI 골구야. 아래 오늘의 시장 데이터·최근 이슈·텔레그램 제보를 종합해서, 특정 종목의 '지금 시황'을 4~6문장으로 깊게 분석해줘.",
    "이 종목이 속한 섹터가 오늘 시장에서 어떤 위치인지, 관련 이슈가 실제로 이 종목에 어떤 영향을 주고 있는지 구체적으로 짚어.",
    "확정적 전망이 아니라 데이터 기반 관찰이라는 톤을 유지하고, 반말로 편하게 써. 다른 설명 없이 본문만 답해.",
  ].join("\n");
  const userPrompt = [
    `분석 대상 종목: ${name} (원래 추천 근거: "${reasoning}")`,
    marketBlock,
    issuesBlock,
    tgBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
  const content = await llmWrite(system, userPrompt);
  return { content: content ?? "시황 분석을 지금은 불러오지 못했어요." };
}

// 3. 거래량 — 최근 거래량 실데이터(계산만, LLM 없음).
export type VolumeDetail = {
  rows: { date: string; volume: number }[];
  baselineAvg: number | null;
  note: string;
};

export async function getVolumeDetail(code: string): Promise<VolumeDetail> {
  const candles = await fetchKisChart(code, "D");
  const rows = candles.slice(-30).map((c) => ({ date: c.date, volume: c.volume }));
  if (rows.length < 10) return { rows, baselineAvg: null, note: "데이터가 아직 부족해요." };

  const recent5 = rows.slice(-5);
  const baseline = rows.slice(0, -5).slice(-20);
  const recentAvg = recent5.reduce((s, r) => s + r.volume, 0) / recent5.length;
  const baselineAvg = baseline.length > 0 ? baseline.reduce((s, r) => s + r.volume, 0) / baseline.length : null;
  const note =
    baselineAvg && baselineAvg > 0
      ? `평소(직전 ${baseline.length}거래일) 평균 ${Math.round(baselineAvg).toLocaleString()}주 대비 최근 5거래일 평균 ${Math.round(recentAvg).toLocaleString()}주 — ${((recentAvg / baselineAvg - 1) * 100).toFixed(0)}% ${recentAvg >= baselineAvg ? "증가" : "감소"}`
      : "평소 대비를 계산할 데이터가 부족해요.";
  return { rows, baselineAvg, note };
}

// 4. 차트 — 캔들 + 시그널 + 지지/저항 스토리 + 매수타이밍, 전부 실데이터.
export type ChartDetail = {
  candles: ChartCandle[];
  signals: TechnicalSignal[];
  levels: SupportResistanceLevel[];
  story: ChartStoryAnnotation[];
  buyTiming: {
    currentPrice: number | null;
    support: number | null;
    resistance: number | null;
    targetPrice: number | null;
    stopLossPrice: number | null;
  };
};

export async function getChartDetail(code: string): Promise<ChartDetail> {
  const candles = await fetchKisChart(code, "D", LONG_TERM_SIGNAL_CANDLES);
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : null;
  const levels = findSupportResistanceLevels(candles);
  // 터치 횟수 1위 레벨을 그냥 집으면 지금 가격과 동떨어진 옛날 레벨이 나올
  // 수 있어서(실측: 후성 093370이 1년 전 4,590원대 레벨을 그대로 "저항선"
  // 이라고 잘못 뱉었음 — 현재가는 13,230원인데), 현재가에 가장 가까운
  // 지지/저항을 따로 뽑는다.
  const nearest = nearestSupportResistance(levels, currentPrice);
  const recent20 = candles.slice(-20).map((c) => c.close);
  const support = nearest.support?.price ?? (recent20.length > 0 ? Math.min(...recent20) : null);
  const resistance = nearest.resistance?.price ?? (recent20.length > 0 ? Math.max(...recent20) : null);
  // 매수타이밍 규칙은 lib/candidate-detail.ts와 동일: 목표가 최소 +6%, 손절 고정 -4%.
  const targetPrice = currentPrice !== null ? Math.max(currentPrice * 1.06, resistance ?? 0) : null;
  const stopLossPrice = currentPrice !== null ? currentPrice * 0.96 : null;

  return {
    candles: candles.slice(-260), // 최근 1년 정도만 차트에 그려도 충분 — 시그널 계산엔 이미 긴 히스토리를 다 썼다
    signals: computeTechnicalSignals(candles),
    levels,
    story: buildChartStory(candles),
    buyTiming: { currentPrice, support, resistance, targetPrice, stopLossPrice },
  };
}

// 5. 재료 — 과거 실제 뉴스로 본 상승/하락 이력. 목표가·손절가는 여기서
// 다루지 않는다(사용자 지시: "차트/매수타이밍"에만 속함) — 순수하게 재료
// 자체(뉴스)에만 집중.
export type MaterialDetail = { news: NewsItem[]; narrative: string };

export async function getMaterialDetail(name: string, reasoning: string): Promise<MaterialDetail> {
  // getBusinessDetail과 같은 이유로 "주가" 덧붙임 — 재료(뉴스) 근거가 이
  // 항목의 핵심인데 무관한 기사가 섞이면 신뢰도가 바로 떨어진다.
  const news = await fetchNews(`${name} 주가`, 8);
  const newsBlock = news.length > 0 ? news.map((n) => `- (${n.pubDate.slice(0, 10)}) ${n.title}: ${n.description}`).join("\n") : "관련 뉴스 없음";

  const system = [
    "너는 한국 주식시장 애널리스트야. 아래 종목의 최근 실제 뉴스를 보고, 이 종목이 최근 왜 주목받았는지(이전 이슈로 인한 상승/하락 이력)를 3~5문장으로 정리해줘.",
    "목표가·손절가·매수 타이밍 얘기는 절대 하지 마 — 순수하게 '어떤 재료/뉴스가 있었고 그게 주가에 어떤 영향을 줬는지'에만 집중해.",
    "뉴스가 마땅치 않으면 그렇다고 솔직히 말해. 반말로 편하게, 다른 설명 없이 본문만 답해.",
  ].join("\n");
  const narrative = await llmWrite(system, `종목: ${name} (당초 추천 근거: "${reasoning}")\n\n[최근 뉴스]\n${newsBlock}`);
  return { news, narrative: narrative ?? "재료 분석을 지금은 불러오지 못했어요." };
}

// 6. 수급 — 일간/주간/월간 순매수(외국인/기관/개인). KIS 투자자매매동향은
// 한 번에 최근 며칠치까지만 주므로(실측 필요), 그 안에서 주/월 단위로
// 묶을 수 있는 만큼만 묶는다.
export type SupplyPeriodRow = { label: string; foreign: number; institution: number; individual: number };
export type SupplyDetail = { daily: InvestorTrendRow[]; weekly: SupplyPeriodRow[]; monthly: SupplyPeriodRow[] };

function isoWeekLabel(dateISO: string): string {
  const d = new Date(dateISO);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const m = monday.getMonth() + 1;
  const dd = monday.getDate();
  return `${m}/${dd}주`;
}

function groupSum(rows: InvestorTrendRow[], labelFor: (r: InvestorTrendRow) => string): SupplyPeriodRow[] {
  const byLabel = new Map<string, SupplyPeriodRow>();
  for (const r of rows) {
    const label = labelFor(r);
    const acc = byLabel.get(label) ?? { label, foreign: 0, institution: 0, individual: 0 };
    acc.foreign += r.foreign;
    acc.institution += r.institution;
    acc.individual += r.individual;
    byLabel.set(label, acc);
  }
  return [...byLabel.values()];
}

export async function getSupplyDetail(code: string): Promise<SupplyDetail> {
  const rows = await fetchInvestorTrend(code, 60);
  const weekly = groupSum(rows, (r) => isoWeekLabel(r.date));
  const monthly = groupSum(rows, (r) => r.date.slice(0, 7));
  return { daily: rows.slice(0, 15), weekly, monthly };
}

// 7. 재무 — 연간 재무제표(data.go.kr 소스 자체가 연간만 제공, 분기 없음 —
// 지어내지 않고 그대로 안내한다).
export type FinancialDetail = { annual: YearlyFinancials[]; quarterlyAvailable: false };

export async function getFinancialDetail(code: string): Promise<FinancialDetail> {
  const nowYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
  const annual = await fetchFinancialHistoryByCode(code, [nowYear - 3, nowYear - 2, nowYear - 1]);
  return { annual, quarterlyAvailable: false };
}
