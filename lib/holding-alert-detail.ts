// 둥지 텔레그램 알림 D단계 — 요약 알림 아래 버튼(📊💰📰⚠️📈)을 눌렀을 때 보여줄
// 상세 화면. 알림을 보낸 시점에 저장한 HoldingAlertRecord만으로 그린다(버튼을
// 누를 때 다시 조회하지 않음 — 알림 문구와 상세 숫자가 어긋나지 않게). DB·
// 네트워크 없는 순수 함수(tests/holding-alert-detail.test.ts).
//
// 사용자 스펙 11번: 사실(조회값)·계산값·해석·조건을 섞지 않는다 — 숫자 줄은 사실/
// 계산, "→"로 시작하는 줄은 규칙이 붙인 해석, 시나리오는 조건으로만 쓴다.

import { STATE_ICON, type AssessmentState, type FinancialYear, type HoldingAssessment, type Signal } from "@/lib/holding-assessment";
import type { PriceSnapshot } from "@/lib/holding-price";
import type { ChartDetail, FlowDetail, InvestorFlow, VolumeDetail } from "@/lib/holding-detail";
import { INVESTOR_LABEL } from "@/lib/holding-detail";
import type { ClassifiedFiling, MoveDecomposition, Scenario } from "@/lib/holding-context";
import type { NewsItem } from "@/lib/naver-news";
import type { MarketSession } from "@/lib/dates";

export const ANALYSIS_VERSION = "holding-alert-v2(2026-10-27)";

export type AlertSection = "chart" | "hold" | "news" | "risk" | "port";
export const SECTION_LABEL: Record<AlertSection, string> = {
  chart: "📊 차트",
  hold: "💰 보유정보",
  news: "📰 뉴스·공시",
  risk: "⚠️ 위험·대응",
  port: "📈 전체 자산",
};

// ---------------------------------------------------------------- 저장 형태

export type PortfolioHoldingRow = {
  code: string;
  name: string;
  state: AssessmentState;
  valuation: number;
  weightPct: number | null; // 전체 자산 대비
  stockWeightPct: number | null; // 주식 평가액 대비
  returnPct: number | null; // 평단 대비 손익
  profit: number; // 평가손익(원)
  todayAmount: number | null; // 오늘 평가액 변동(원) = 수량 × 전일 대비 원
  recoveryNeededPct: number | null;
  firstBuyDate: string | null;
  holdingDays: number | null;
};

export type PortfolioSnapshot = {
  asOf: string; // "YYYY-MM-DD HH:mm"
  session: MarketSession;
  totalValuation: number; // 현금·채권·대체 포함
  stockValuation: number;
  todayChangeAmount: number; // 오늘 변동을 아는 종목들만 합친 값
  todayChangeKnown: number; // 그 종목 수
  holdings: PortfolioHoldingRow[];
  flags: string[];
};

// 알림을 보내는 시점의 전체 자산 상태 — 진단 리포트(lib/holding-assessment-store.ts)에
// 이미 있는 값만 옮긴다.
export function buildPortfolioSnapshot(p: {
  asOf: string;
  session: MarketSession;
  totalValuation: number;
  assessments: HoldingAssessment[];
  prices: Record<string, PriceSnapshot>;
  flags: string[];
}): PortfolioSnapshot {
  const stockValuation = p.assessments.reduce((s, a) => s + a.valuation, 0);
  let todayChangeAmount = 0;
  let todayChangeKnown = 0;
  const holdings: PortfolioHoldingRow[] = p.assessments.map((a) => {
    const change = p.prices[a.code]?.changeAmount ?? null;
    const todayAmount = change !== null ? change * a.quantity : null;
    if (todayAmount !== null) {
      todayChangeAmount += todayAmount;
      todayChangeKnown++;
    }
    return {
      code: a.code,
      name: a.name,
      state: a.state,
      valuation: a.valuation,
      weightPct: a.weightPct,
      stockWeightPct: stockValuation > 0 ? (a.valuation / stockValuation) * 100 : null,
      returnPct: a.changePct,
      profit: (a.currentPrice - a.avgBuyPrice) * a.quantity,
      todayAmount,
      recoveryNeededPct: a.recoveryNeededPct,
      firstBuyDate: a.firstBuyDate,
      holdingDays: a.holdingDays,
    };
  });
  return { asOf: p.asOf, session: p.session, totalValuation: p.totalValuation, stockValuation, todayChangeAmount, todayChangeKnown, holdings, flags: p.flags };
}

export type DataQualityItem = { item: string; ok: boolean; note: string };

export type AlertRecordPayload = {
  technical: { price: PriceSnapshot | null; chart: ChartDetail | null };
  volume: VolumeDetail | null;
  flow: FlowDetail | null;
  financial: { years: FinancialYear[]; signalNote: string | null };
  sector: { theme: string | null; move: MoveDecomposition | null };
  news: { news: { ok: boolean; items: NewsItem[] }; filings: { ok: boolean; items: ClassifiedFiling[]; total: number } };
  trigger: { reasons: string[]; signals: Signal[]; stateNote: string; deepLoss: string | null };
  action: { scenarios: Scenario[] | null; thesis: { reason: string; invalidation: string | null; updatedAt: string } | null };
  portfolio: PortfolioSnapshot | null;
  dataQuality: DataQualityItem[];
};

// DB 행(HoldingAlertRecord) 중 상세 화면에 필요한 것
export type AlertRecordRow = {
  id: string;
  stockCode: string;
  stockName: string;
  alertType: string;
  generatedAt: Date;
  marketDataAsOf: string | null;
  portfolioDataAsOf: string;
  previousSeverity: string | null;
  currentSeverity: string;
  previousRiskScore: number | null;
  currentRiskScore: number;
  currentPrice: number;
  avgBuyPrice: number;
  holdingQuantity: number;
  unrealizedReturnPct: number | null;
  analysisVersion: string;
  technicalSnapshot: string;
  volumeSnapshot: string;
  flowSnapshot: string;
  financialSnapshot: string;
  sectorSnapshot: string;
  newsEvidence: string;
  triggerReasons: string;
  actionScenarios: string;
  portfolioSnapshot: string;
  dataQuality: string;
};

export function serializePayload(p: AlertRecordPayload) {
  return {
    technicalSnapshot: JSON.stringify(p.technical),
    volumeSnapshot: JSON.stringify(p.volume),
    flowSnapshot: JSON.stringify(p.flow),
    financialSnapshot: JSON.stringify(p.financial),
    sectorSnapshot: JSON.stringify(p.sector),
    newsEvidence: JSON.stringify(p.news),
    triggerReasons: JSON.stringify(p.trigger),
    actionScenarios: JSON.stringify(p.action),
    portfolioSnapshot: JSON.stringify(p.portfolio),
    dataQuality: JSON.stringify(p.dataQuality),
  };
}

function parse<T>(raw: string, fallback: T): T {
  try {
    const v = JSON.parse(raw);
    return v === null || v === undefined ? fallback : (v as T);
  } catch {
    return fallback;
  }
}

export function parsePayload(r: AlertRecordRow): AlertRecordPayload {
  return {
    technical: parse(r.technicalSnapshot, { price: null, chart: null }),
    volume: parse<VolumeDetail | null>(r.volumeSnapshot, null),
    flow: parse<FlowDetail | null>(r.flowSnapshot, null),
    financial: parse(r.financialSnapshot, { years: [], signalNote: null }),
    sector: parse(r.sectorSnapshot, { theme: null, move: null }),
    news: parse(r.newsEvidence, { news: { ok: false, items: [] }, filings: { ok: false, items: [], total: 0 } }),
    trigger: parse(r.triggerReasons, { reasons: [], signals: [], stateNote: "", deepLoss: null }),
    action: parse(r.actionScenarios, { scenarios: null, thesis: null }),
    portfolio: parse<PortfolioSnapshot | null>(r.portfolioSnapshot, null),
    dataQuality: parse<DataQualityItem[]>(r.dataQuality, []),
  };
}

// ---------------------------------------------------------------- 버튼

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

// callback_data는 64바이트 제한 — "hn:<cuid 25자>:chart" ≈ 34바이트.
// hn = 요약 알림에서 눌림(새 메시지로 상세를 띄움), he = 상세 메시지 안에서 눌림(그 메시지를 고쳐 씀)
export function summaryKeyboard(records: { id: string; name: string }[]): InlineKeyboard {
  const rows: InlineButton[][] = records.map((r) => [{ text: `🔎 ${r.name} 자세히`, callback_data: `hn:${r.id}:chart` }]);
  if (records.length > 0) rows.push([{ text: "📈 전체 자산 영향", callback_data: `hn:${records[0].id}:port` }]);
  return { inline_keyboard: rows };
}

export function detailKeyboard(id: string, current: AlertSection): InlineKeyboard {
  const b = (s: AlertSection): InlineButton => ({ text: s === current ? `▶ ${SECTION_LABEL[s]}` : SECTION_LABEL[s], callback_data: `he:${id}:${s}` });
  return { inline_keyboard: [[b("chart"), b("hold")], [b("news"), b("risk")], [b("port")]] };
}

export function parseAlertCallback(data: string | undefined): { mode: "new" | "edit"; id: string; section: AlertSection } | null {
  const m = /^h([ne]):([a-z0-9]{10,40}):(chart|hold|news|risk|port)$/.exec(data ?? "");
  if (!m) return null;
  return { mode: m[1] === "n" ? "new" : "edit", id: m[2], section: m[3] as AlertSection };
}

// ---------------------------------------------------------------- 숫자 표기

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const signedWon = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.round(Math.abs(n)).toLocaleString("ko-KR")}원`;
const pct = (n: number, d = 1) => `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;
const qty = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString("ko-KR")}주`;

// 거래대금처럼 큰 금액 — 1억 이상은 억, 1만 이상은 만 단위
export function compactWon(n: number, signed = false): string {
  const sign = signed ? (n > 0 ? "+" : n < 0 ? "-" : "") : n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1)}억원`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString("ko-KR")}만원`;
  return `${sign}${Math.round(a).toLocaleString("ko-KR")}원`;
}

export function kstLabel(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso.slice(5, 7)}/${iso.slice(8)}`; // 날짜만 있으면 시각을 지어내지 않는다
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(d)
    .replace(/\.\s?/g, "/")
    .replace(/\/\s?(\d\d:)/, " $1")
    .replace(/\/$/, "");
}

const shortDate = (ymd: string) => (ymd.length === 10 ? `${ymd.slice(2, 4)}/${ymd.slice(5, 7)}/${ymd.slice(8)}` : ymd);
const mmdd = (ymd: string) => (ymd.length === 10 ? `${ymd.slice(5, 7)}/${ymd.slice(8)}` : ymd.length === 8 ? `${ymd.slice(4, 6)}/${ymd.slice(6)}` : ymd);

// 수정(editMessageText)은 쪼개 보낼 수 없어서 한 화면 안에 맞춘다
const MAX_SECTION_CHARS = 3500;
function fit(lines: string[]): string {
  const text = lines.join("\n");
  return text.length <= MAX_SECTION_CHARS ? text : `${text.slice(0, MAX_SECTION_CHARS - 20)}\n…(길어서 생략)`;
}

function priceHeader(p: PriceSnapshot | null): string {
  if (!p) return "시세 조회 실패 — 가격 정보 없음";
  const today = p.changePct === null ? "오늘 등락 확인 불가" : p.changeAmount === null ? `오늘 ${pct(p.changePct, 2)}` : `오늘 ${signedWon(p.changeAmount)}(${pct(p.changePct, 2)})`;
  return p.live
    ? `${p.priceLabel} ${won(p.price)} · ${today} · ${kstLabel(p.asOf)} 기준(${p.session})`
    : `최근 일봉 ${won(p.price)} · ${today} · ${p.asOf} 일봉(실시간 시세 조회 실패)`;
}

// ---------------------------------------------------------------- 📊 차트

function flowLine(f: InvestorFlow): string {
  const label = INVESTOR_LABEL[f.key];
  if (!f.latest) return `${label}: 데이터 없음`;
  const parts = [`최근일 ${qty(f.latest.qty)}(${compactWon(f.latest.amount, true)})`];
  if (f.sum5) parts.push(`5일 ${qty(f.sum5.qty)}${f.sum5.pctOfVolume !== null ? `(거래량의 ${pct(f.sum5.pctOfVolume)})` : ""}`);
  if (f.sum20) parts.push(`20일 ${qty(f.sum20.qty)}${f.sum20.pctOfVolume !== null ? `(${pct(f.sum20.pctOfVolume)})` : ""}`);
  else parts.push("20일 누적: 데이터 부족");
  if (f.streak) parts.push(`${f.streak.days}일 연속 ${f.streak.direction}`);
  return `${label}: ${parts.join(" · ")}`;
}

export function renderChartSection(r: AlertRecordRow, p: AlertRecordPayload): string {
  const c = p.technical.chart;
  const lines = [`📊 **${r.stockName}**(${r.stockCode}) 차트·거래량·수급`, priceHeader(p.technical.price), ""];

  if (!c) {
    lines.push("차트: 일봉 데이터를 가져오지 못해 계산하지 않았어요");
  } else {
    lines.push(`[이동평균] ${c.asOfDate} 일봉 기준 (이격도 · 5거래일 기울기)`);
    for (const m of c.mas) {
      lines.push(`${m.period}일선 ${won(m.value)} (${(100 + m.gapPct).toFixed(1)} · ${m.trend ?? "-"}${m.slopePct !== null ? ` ${pct(m.slopePct)}` : ""})`);
    }
    if (c.missingMas.length > 0) lines.push(`${c.missingMas.map((n) => `${n}일선`).join("·")}: 상장 기간이 짧아 계산 불가`);
    if (c.alignment) lines.push(`배열: ${c.alignment}`);

    lines.push("", "[가격 범위]");
    for (const g of c.ranges) {
      // 52주는 해를 넘기니 연도까지, 20·60일은 월/일만
      const d = g.label === "52주" ? shortDate : mmdd;
      lines.push(`${g.label}${g.days < (g.label === "52주" ? 250 : g.label === "60일" ? 60 : 20) ? `(${g.days}거래일)` : ""} 고점 ${won(g.high)}(${d(g.highDate)}, ${pct(g.fromHighPct)}) · 저점 ${won(g.low)}(${d(g.lowDate)}, ${pct(g.fromLowPct)})`);
    }
    lines.push("", "[지지·저항] 최근 1년 스윙 고점·저점");
    lines.push(
      [
        c.support ? `지지 ${won(c.support.price)}(${pct(c.support.distancePct)}, ${c.support.touches}회)` : "지지: 현재가 아래 계산된 레벨 없음",
        c.resistance ? `저항 ${won(c.resistance.price)}(${pct(c.resistance.distancePct)}, ${c.resistance.touches}회)` : "저항: 현재가 위 계산된 레벨 없음",
      ].join(" · ")
    );

    lines.push("", "[보조지표]");
    const rsiNote = c.rsi14 === null ? "RSI14 데이터 부족" : `RSI14 ${c.rsi14.toFixed(1)}${c.rsi14 <= 30 ? " — 30 이하(과매도권)" : c.rsi14 >= 70 ? " — 70 이상(과열권)" : ""}`;
    const atrNote = c.atr14 === null ? "ATR14 데이터 부족" : `ATR14 ${won(c.atr14)}(현재가의 ${c.atrPct!.toFixed(1)}%)`;
    lines.push(`${rsiNote} · ${atrNote}`);
    const b = c.bollinger;
    if (!b) lines.push("볼린저: 20거래일 미만이라 계산 불가");
    else {
      lines.push(`볼린저(20,2) 상단 ${won(b.upper)} · 중심 ${won(b.middle)} · 하단 ${won(b.lower)}`);
      lines.push(
        `%B ${b.percentB === null ? "-" : b.percentB.toFixed(2)}${b.zone ? `(${b.zone})` : ""} · 밴드폭 ${b.bandWidthPct.toFixed(1)}%${b.bandWidthPercentile !== null ? `(과거 대비 ${b.bandWidthPercentile.toFixed(0)}분위${b.squeeze ? ", 수축" : ""})` : ""}${b.slope ? ` · 중심선 ${b.slope}` : ""}`
      );
      const ev: string[] = [];
      if (b.touch) ev.push(`오늘 ${b.touch}`);
      if (b.walk) ev.push(`${b.walk} ${b.walkDays}거래일째`);
      if (b.reentry) ev.push(b.reentry.reentryDate ? `${mmdd(b.reentry.breachDate)} 하단 이탈 → ${mmdd(b.reentry.reentryDate)} 재진입` : `${mmdd(b.reentry.breachDate)} 하단 이탈 후 아직 재진입 전`);
      if (ev.length > 0) lines.push(ev.join(" · "));
    }
  }

  const v = p.volume;
  lines.push("", "[거래량]");
  if (!v) lines.push("거래량 데이터 없음");
  else {
    if (v.partial) {
      lines.push(`오늘 누적 ${v.latestVolume.toLocaleString("ko-KR")}주${v.latestTradingValue ? ` · ${compactWon(v.latestTradingValue)}` : ""} (장중)`);
      if (v.progressPct !== null)
        lines.push(`20일 평균 ${Math.round(v.avg20Volume!).toLocaleString("ko-KR")}주의 ${v.progressPct.toFixed(1)}%${v.sessionElapsedPct !== null ? ` · 정규장 ${v.sessionElapsedPct.toFixed(0)}% 경과` : ""}`);
      lines.push("→ 장중 누적을 하루 평균과 그대로 비교해 많다·적다로 판단하지 않아요");
    } else {
      lines.push(
        `${v.latestDate} 거래량 ${v.latestVolume.toLocaleString("ko-KR")}주${v.latestTradingValue ? ` · ${compactWon(v.latestTradingValue)}` : ""}${v.vsAvg20Pct !== null ? ` — 직전 20거래일 평균 ${Math.round(v.avg20Volume!).toLocaleString("ko-KR")}주 대비 ${pct(v.vsAvg20Pct)}` : ""}`
      );
    }
    if (v.avg5TradingValue !== null) lines.push(`직전 5거래일 평균 거래대금 ${compactWon(v.avg5TradingValue)}`);
    if (v.upDayAvgVolume !== null || v.downDayAvgVolume !== null) {
      lines.push(
        `최근 20거래일 상승일 평균 ${v.upDayAvgVolume !== null ? `${Math.round(v.upDayAvgVolume).toLocaleString("ko-KR")}주` : "-"}(${v.upDays}일) · 하락일 평균 ${v.downDayAvgVolume !== null ? `${Math.round(v.downDayAvgVolume).toLocaleString("ko-KR")}주` : "-"}(${v.downDays}일)`
      );
    }
  }

  const f = p.flow;
  lines.push("", `[수급] KIS 투자자별${f?.asOfDate ? ` · ${f.asOfDate}까지 집계` : ""}`);
  if (!f || f.days === 0) lines.push("수급 데이터를 가져오지 못했어요");
  else {
    for (const inv of f.investors) lines.push(flowLine(inv));
    if (p.technical.price?.session === "장중") lines.push("※ 오늘 수급은 장 마감 후 집계돼서 아직 빠져 있어요");
  }
  lines.push("", "※ 출처: KIS 시세·일봉·투자자별 매매동향. 이평·RSI·ATR·볼린저·비율은 그 값으로 계산");
  return fit(lines);
}

// ---------------------------------------------------------------- 💰 보유정보

export function renderHoldSection(r: AlertRecordRow, p: AlertRecordPayload): string {
  const h = p.portfolio?.holdings.find((x) => x.code === r.stockCode) ?? null;
  const cost = r.avgBuyPrice * r.holdingQuantity;
  const valuation = r.currentPrice * r.holdingQuantity;
  const profit = valuation - cost;
  const lines = [
    `💰 **${r.stockName}** 보유 정보 (둥지 입력 기준 · ${kstLabel(r.portfolioDataAsOf)} 조회)`,
    `평단 ${won(r.avgBuyPrice)} × ${r.holdingQuantity.toLocaleString("ko-KR")}주`,
    `매수금액 ${won(cost)} → 평가금액 ${won(valuation)}`,
    `평가손익 **${signedWon(profit)}${r.unrealizedReturnPct !== null ? `(${pct(r.unrealizedReturnPct)})` : ""}**`,
  ];
  const price = p.technical.price;
  if (price?.changeAmount !== null && price?.changeAmount !== undefined) {
    lines.push(`오늘 평가액 변동 ${signedWon(price.changeAmount * r.holdingQuantity)} (오늘 ${signedWon(price.changeAmount)} × ${r.holdingQuantity.toLocaleString("ko-KR")}주)`);
  }
  if (h?.recoveryNeededPct !== null && h?.recoveryNeededPct !== undefined) lines.push(`원금 회복까지 +${h.recoveryNeededPct.toFixed(1)}% 필요`);
  if (h) {
    const w = [h.weightPct !== null ? `전체 자산의 ${h.weightPct.toFixed(1)}%` : null, h.stockWeightPct !== null ? `주식 자산의 ${h.stockWeightPct.toFixed(1)}%` : null].filter(Boolean);
    if (w.length > 0) lines.push(`비중: ${w.join(" · ")}`);
    if (h.holdingDays !== null && h.firstBuyDate) lines.push(`보유 기간: ${h.holdingDays}일(첫 매수 ${h.firstBuyDate})`);
  }
  lines.push("", "※ 세금·수수료 미반영. 평단·수량이 실제 계좌와 다르면 둥지에서 고쳐줘");
  return fit(lines);
}

// ---------------------------------------------------------------- 📰 뉴스·공시

const SEVERITY_ICON = { 긴급: "🚨", 주의: "⚠️", 참고: "ℹ️" } as const;

export function renderNewsSection(r: AlertRecordRow, p: AlertRecordPayload): string {
  const { news, filings } = p.news;
  const lines = [`📰 **${r.stockName}** 뉴스·공시 (${kstLabel(r.generatedAt.toISOString())} 조회)`, "", "[공시] DART 최근 30일"];
  if (!filings.ok) lines.push("DART 조회 실패 — 공시가 없다는 뜻은 아니에요. DART에서 직접 확인해줘");
  else if (filings.items.length === 0) lines.push(`중요 공시 없음(전체 ${filings.total}건 중 거래정지·감사의견·희석·실적 등 해당 없음)`);
  else {
    lines.push(`전체 ${filings.total}건 중 중요 ${filings.items.length}건`);
    for (const f of filings.items) {
      lines.push(`${SEVERITY_ICON[f.severity]} ${mmdd(f.reportDate)} [${f.category}] ${f.reportName.replace(/\s+/g, " ")}`);
      if (f.severity !== "참고") lines.push(`  https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${f.rceptNo}`);
    }
  }

  lines.push("", "[뉴스] 네이버 최근 7일 · 종목명이 들어간 기사");
  if (!news.ok) lines.push("뉴스 조회 실패 — 뉴스가 없다는 뜻은 아니에요");
  else if (news.items.length === 0) lines.push("최근 7일 관련 기사 없음");
  else {
    for (const n of news.items) {
      lines.push(`- ${kstLabel(n.pubDate)} ${n.title}${n.source ? ` (${n.source})` : ""}`);
      if (n.link) lines.push(`  ${n.link}`);
    }
  }

  lines.push("", "[재무] KRX 연간(최근 3개년)");
  const years = [...p.financial.years].sort((a, b) => b.year - a.year);
  if (years.length === 0) lines.push("재무 데이터를 확인하지 못했어요");
  for (const y of years) {
    lines.push(`${y.year}년 영업이익 ${compactWon(y.operatingProfit)} · 순이익 ${compactWon(y.netIncome)} · 자본총계 ${compactWon(y.totalEquity)}`);
  }
  lines.push("분기 실적·영업현금흐름: 아직 연결 안 됨(DART에서 직접 확인)");
  lines.push("", "※ 공시는 제목으로 분류해서 정정·취소 공시도 섞일 수 있어요. 영향은 원문으로 확인해줘");
  return fit(lines);
}

// ---------------------------------------------------------------- ⚠️ 위험·대응

function moveLine(m: MoveDecomposition): string[] {
  const parts: string[] = [];
  parts.push(m.stockPct === null ? "종목 등락 확인 불가" : `종목 ${pct(m.stockPct, 2)}`);
  if (m.market) parts.push(`${m.market.name} ${pct(m.market.pct, 2)}${m.vsMarketPp !== null ? `(종목이 ${pct(m.vsMarketPp, 1).replace("%", "%p")})` : ""}`);
  else parts.push("시장 지수 확인 불가");
  if (m.sector) {
    parts.push(
      `업종 '${m.sector.name}' ${m.sector.peers}종목 평균 ${pct(m.sector.avgPct, 2)}(${kstLabel(m.sector.asOf)} 집계${m.vsSectorPp !== null ? `, 종목이 ${pct(m.vsSectorPp, 1).replace("%", "%p")}` : ""})`
    );
  }
  return [parts.join(" · "), `→ ${m.verdict}`];
}

export function renderRiskSection(r: AlertRecordRow, p: AlertRecordPayload): string {
  const cur = r.currentSeverity as AssessmentState;
  const prev = r.previousSeverity as AssessmentState | null;
  const head = prev
    ? `⚠️ **${r.stockName}** 위험·대응 — ${STATE_ICON[prev]}${prev} → **${STATE_ICON[cur]}${cur}**`
    : `⚠️ **${r.stockName}** 위험·대응 — 신규 진단 **${STATE_ICON[cur]}${cur}**`;
  const score = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  const lines = [head, `신호 합계 ${r.previousRiskScore !== null ? `${score(r.previousRiskScore)} → ` : ""}${score(r.currentRiskScore)} (≥+2 유지 · 0~+1 관찰 · -1~-3 축소검토 · ≤-4 정밀점검)`, "", "[등급 근거] 규칙 계산"];
  for (const s of p.trigger.signals) lines.push(`${s.label} ${s.score === null ? "제외" : score(s.score)}: ${s.note}`);
  if (p.trigger.reasons.length > 0) lines.push(`바뀐 핵심 원인: ${p.trigger.reasons.join(" / ")}`);
  if (p.trigger.deepLoss) lines.push(p.trigger.deepLoss);

  lines.push("", "[오늘 움직임 원인 분리]");
  if (p.sector.move) lines.push(...moveLine(p.sector.move));
  else lines.push("원인 분리용 데이터를 모으지 못했어요");
  if (!p.sector.theme) lines.push("업종(테마) 분류가 없는 종목이라 업종 비교는 빠져 있어요");

  lines.push("", "[투자 논리 점검]");
  const t = p.action.thesis;
  if (t) {
    lines.push(`매수 이유: "${t.reason}" (${kstLabel(t.updatedAt)} 기록)`);
    lines.push(t.invalidation ? `무효화 조건: "${t.invalidation}" → 지금 상황이 이 조건에 해당하는지 확인해줘` : "무효화 조건은 기록돼 있지 않아요 — 어떤 상황이면 팔지 정해두면 다음부터 같이 점검할게요");
  } else {
    lines.push(`매수 이유가 기록돼 있지 않아요. 골구에게 "${r.stockName} 산 이유는 ~이고, ~하면 팔 거야"라고 말해주면 다음 알림부터 같이 점검할게요`);
  }

  lines.push("", "[조건별 시나리오] 예측이 아니라 확인 기준");
  const sc = p.action.scenarios;
  if (!sc) lines.push("차트 데이터가 부족해 시나리오를 만들지 않았어요");
  else {
    const num = ["①", "②", "③"];
    sc.forEach((s, i) => {
      lines.push(`${num[i] ?? "-"} ${s.name} — 조건: ${s.condition}`);
      lines.push(`   볼 가격: ${s.watch}`);
      lines.push(`   대응: ${s.response}`);
      lines.push(`   무효화: ${s.invalidation}`);
    });
  }
  lines.push("※ 매수·매도 지시가 아니라 조건별로 확인할 지점이에요");

  if (p.dataQuality.length > 0) {
    lines.push("", `[데이터] ${p.dataQuality.map((d) => `${d.item} ${d.ok ? "✅" : "❌"}${d.note ? `(${d.note})` : ""}`).join(" · ")}`);
  }
  lines.push(`분석 버전 ${r.analysisVersion}`);
  return fit(lines);
}

// ---------------------------------------------------------------- 📈 전체 자산

export function renderPortfolioSection(p: AlertRecordPayload): string {
  const s = p.portfolio;
  if (!s) return "📈 전체 자산 영향: 이 알림엔 자산 스냅샷이 저장되지 않았어요";
  const nonStock = s.totalValuation - s.stockValuation;
  const lines = [
    `📈 전체 자산 영향 (${s.asOf} 기준, ${s.session})`,
    `총자산 ${won(s.totalValuation)} · 주식 ${won(s.stockValuation)}${s.totalValuation > 0 ? `(${((s.stockValuation / s.totalValuation) * 100).toFixed(1)}%)` : ""} · 현금·채권·대체 ${won(nonStock)}`,
    `오늘 주식 평가액 변동 **${signedWon(s.todayChangeAmount)}** (${s.holdings.length}종목 중 ${s.todayChangeKnown}종목 시세 기준)`,
    "",
    "[종목별] 평가액 큰 순",
  ];
  for (const h of [...s.holdings].sort((a, b) => b.valuation - a.valuation)) {
    lines.push(
      `${STATE_ICON[h.state]} ${h.name} ${won(h.valuation)}${h.weightPct !== null ? ` · 비중 ${h.weightPct.toFixed(1)}%` : ""} · 손익 ${h.returnPct !== null ? pct(h.returnPct) : "-"}${h.todayAmount !== null ? ` · 오늘 ${signedWon(h.todayAmount)}` : ""}`
    );
  }
  if (s.flags.length > 0) lines.push("", "[포트폴리오 경고]", ...s.flags.map((f) => `- ${f}`));
  lines.push("", "※ 둥지 입력값(평단·수량·현금 등) 기준, 세금·수수료 미반영");
  return fit(lines);
}

export function renderSection(section: AlertSection, r: AlertRecordRow): string {
  const p = parsePayload(r);
  switch (section) {
    case "chart":
      return renderChartSection(r, p);
    case "hold":
      return renderHoldSection(r, p);
    case "news":
      return renderNewsSection(r, p);
    case "risk":
      return renderRiskSection(r, p);
    case "port":
      return renderPortfolioSection(p);
  }
}
