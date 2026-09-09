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
import { fetchDartBusinessBundle, dartTablesToText } from "@/lib/dart";
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
    // 이 라우트(/api/bro/field-detail) 전체 예산이 30초라 SDK 기본값(10분
    // 타임아웃 + 자동 재시도)에 맡기면 안 된다 — 실측: getBusinessDetail의
    // 프롬프트(DART 원문 최대 9500자)가 다른 필드보다 훨씬 커서 응답이
    // 느려질 때 SDK가 조용히 재시도까지 하면서 30초 하드 타임아웃까지
    // 끌고 가 FUNCTION_INVOCATION_TIMEOUT을 냈다. 여기서 실패해도
    // llmWriteJson/각 getXDetail 호출부가 이미 폴백(원문 그대로 보여주기
    // 등)을 갖고 있어서 null로 빨리 끝나는 게 사용자 입장에서 훨씬 낫다.
    const response = await client.messages.create(
      {
        model: "claude-sonnet-5",
        max_tokens: maxTokens,
        output_config: { effort: "low" },
        system,
        messages: [{ role: "user", content: userPrompt }],
      },
      { timeout: 10000, maxRetries: 0 }
    );
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

// system이 JSON 객체 하나만 답하도록 지시했을 때 파싱까지 해주는 변형.
// 파싱 실패(응답이 아예 없거나 JSON이 깨진 경우)엔 null을 돌려주고, 호출부가
// "원문 그대로 보여주기" 같은 사실 기반 폴백을 알아서 하도록 맡긴다.
async function llmWriteJson<T>(system: string, userPrompt: string, maxTokens = 1200): Promise<T | null> {
  const text = await llmWrite(system, userPrompt, maxTokens);
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

// 1. 사업 요약 — DART 정기보고서(사업/반기/분기보고서) "II. 사업의 내용"
// 원문에서 사업 개요·주요 제품(매출 비중)·신규 사업목적을 그대로 가져와
// 사실 근거로 삼는다(사용자 요청: "사업 분석 할 때 팩트를 기반으로
// 해석해줘") — 뉴스나 LLM 추측이 아니라 실제 공시 원문이 출처다. LLM은
// 그 원문을 요약·정리만 하고, 원문에 없는 수치는 언급하지 말라고 명시한다.
export type BusinessDetail = {
  overview: string;
  products: string;
  newBusiness: string;
  reportName: string | null;
  reportDate: string | null;
  dartUrl: string | null;
};

const DART_UNAVAILABLE_NOTE =
  "DART 공시에서 사업 내용을 찾지 못했어요 — 종목코드가 없거나 최근 2년 내 정기보고서(사업/반기/분기보고서)가 아직 없는 경우예요.";

export async function getBusinessDetail(name: string, code: string): Promise<BusinessDetail> {
  const bundle = code ? await fetchDartBusinessBundle(code) : null;

  if (!bundle) {
    return { overview: DART_UNAVAILABLE_NOTE, products: "", newBusiness: "", reportName: null, reportDate: null, dartUrl: null };
  }

  const productsText = dartTablesToText(bundle.raw.productsTables);
  const system = [
    "너는 한국 주식시장 섹터 전문 애널리스트야. 아래는 실제 DART 공시(정기보고서) 원문에서 그대로 발췌한 내용이야.",
    "이 원문에 있는 사실만 근거로 세 가지를 정리해줘 — 원문에 없는 내용이나 수치는 절대 지어내지 마.",
    "1) overview: 이 회사가 실제로 무슨 사업을 하는지 4~6문장으로 (사업부문 구조·핵심 제품/기술·산업 내 위치를 원문 근거로)",
    "2) products: 주요 제품/서비스별 매출 비중을 원문 표 수치를 실제로 인용해서 정리 — 표에 비중 정보가 없으면 '매출 비중 정보가 표에 없음'이라고 써",
    "3) newBusiness: 원문에 최근 추가된 사업목적/신규사업 내용이 있으면 정리, 전혀 없으면 정확히 '최근 신규 사업목적 추가 내역 없음'이라고 써",
    "반말로 편하게. 다른 설명 없이 JSON 객체 하나만 답해: {\"overview\":\"...\",\"products\":\"...\",\"newBusiness\":\"...\"}",
  ].join("\n");
  const userPrompt = [
    `종목: ${name} (${code}) — 출처: ${bundle.reportName} (${bundle.reportDate})`,
    `[1. 사업의 개요 원문]\n${bundle.raw.overviewText || "내용 없음"}`,
    `[2. 주요 제품 및 서비스 - 표 원문]\n${productsText || "표 데이터 없음"}`,
    `[5. 정관에 관한 사항 - 신규 사업목적 원문]\n${bundle.raw.newBusinessText || "해당 없음"}`,
  ].join("\n\n");

  const parsed = await llmWriteJson<{ overview?: string; products?: string; newBusiness?: string }>(system, userPrompt);

  return {
    // LLM 요약이 실패해도 원문 자체는 이미 확보돼 있으니, 다듬어지지 않은
    // 원문 그대로라도 보여주는 게(빈 화면보다) "팩트 기반"에 더 맞는다.
    overview: parsed?.overview || bundle.raw.overviewText || "사업 개요를 원문에서 찾지 못했어요.",
    products: parsed?.products || (productsText ? "표 원문:\n" + productsText : "매출 비중 표를 찾지 못했어요."),
    newBusiness: parsed?.newBusiness || bundle.raw.newBusinessText || "최근 신규 사업목적 추가 내역 없음",
    reportName: bundle.reportName,
    reportDate: bundle.reportDate,
    dartUrl: bundle.dartUrl,
  };
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
