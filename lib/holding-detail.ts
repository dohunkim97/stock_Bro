// 보유종목 상세 분석(텔레그램 알림 고도화 B단계, 사용자 스펙 2026-10-27 3~5번) —
// 차트·거래량·수급을 이미 가져온 KIS 일봉/투자자 동향으로만 계산한다. 새 API는
// 없다. DB·네트워크 없는 순수 함수라 tests/holding-detail.test.ts로 바로 검증한다.
//
// 원칙: 계산할 데이터가 부족하면 그 항목은 null로 두고 "데이터 부족"으로 보여준다
// — 0이나 추정치로 채우지 않는다. 등급(lib/holding-assessment.ts)은 이 값들로
// 바꾸지 않는다(등급 규칙을 임의로 바꾸지 않기 위해 — 여기는 보여주기·설명용).

import type { ChartCandle } from "@/lib/kis-chart";
import type { InvestorTrendRow } from "@/lib/kis-investor-trend";
import type { KisQuote } from "@/lib/kis-quote";
import type { FinancialYear } from "@/lib/holding-assessment";
import { computeBollinger, percentBZone, type BandReentryEvent, type BollingerSlope, type PercentBZone } from "@/lib/bollinger";
import { rsi } from "@/lib/prediction-features";
import { findSupportResistanceLevels, nearestSupportResistance } from "@/lib/technical-signals";

// ---------------------------------------------------------------- 차트

export type Trend = "상승" | "횡보" | "하락";

export const MA_PERIODS = [5, 20, 60, 120] as const;
export type MaPeriod = (typeof MA_PERIODS)[number];

export type MaLine = {
  period: MaPeriod;
  value: number;
  gapPct: number; // 이격도 - 100, 즉 (현재가/이평 - 1)×100. 이격도 자체는 100 + gapPct
  slopePct: number | null; // 5거래일 전 이평 대비 변화율
  trend: Trend | null;
};

export type PriceRange = {
  label: "20일" | "60일" | "52주";
  days: number; // 실제로 쓴 거래일 수(상장 기간이 짧으면 기간보다 적다)
  high: number;
  highDate: string;
  low: number;
  lowDate: string;
  fromHighPct: number; // 현재가가 고점 대비 몇 %(0 이하)
  fromLowPct: number; // 저점 대비 몇 %(0 이상)
};

export type Level = { price: number; touches: number; distancePct: number };

export type BandPosition = "상단 밴드워크" | "하단 밴드워크" | null;

export type BollingerDetail = {
  upper: number;
  middle: number;
  lower: number;
  percentB: number | null;
  zone: PercentBZone | null;
  bandWidthPct: number;
  bandWidthPercentile: number | null;
  squeeze: boolean;
  slope: BollingerSlope | null;
  touch: "상단 터치" | "하단 터치" | null; // 오늘 고가/저가가 밴드에 닿았는지
  walk: BandPosition; // 상단/하단 근접 이상이 연속 3거래일 이상
  walkDays: number;
  reentry: BandReentryEvent | null; // 최근 20거래일 안의 하단 이탈→재진입만
};

export type ChartDetail = {
  asOfDate: string; // 마지막 일봉 날짜(장중이면 진행 중인 오늘)
  price: number;
  mas: MaLine[];
  missingMas: MaPeriod[]; // 상장 기간이 짧아 계산 못 한 이평
  alignment: "정배열" | "역배열" | "혼조" | null; // 5·20·60·120 네 개가 다 있을 때만
  ranges: PriceRange[];
  // 오늘(마지막 캔들)을 뺀 직전 20거래일 최저가 — "20거래일 최저가 이탈" 이벤트용.
  // ranges의 20일 저점은 오늘을 포함해서 현재가가 그 아래로 갈 수 없다.
  prior20Low: { price: number; date: string } | null;
  support: Level | null;
  resistance: Level | null;
  rsi14: number | null;
  atr14: number | null;
  atrPct: number | null; // ATR / 현재가 — 하루 평균 변동 폭
  bollinger: BollingerDetail | null;
};

const SLOPE_LOOKBACK = 5;
// lib/bollinger.ts와 같은 기준(±1%) — 같은 앱 안에서 "횡보"의 뜻이 달라지지 않게.
const SLOPE_FLAT_PCT = 1;
const WALK_MIN_DAYS = 3;
const REENTRY_RECENT_DAYS = 20;
const LEVEL_LOOKBACK = 250;

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function trendOf(slopePct: number | null): Trend | null {
  if (slopePct === null) return null;
  return slopePct >= SLOPE_FLAT_PCT ? "상승" : slopePct <= -SLOPE_FLAT_PCT ? "하락" : "횡보";
}

function maAt(closes: number[], period: number, endExclusive: number): number | null {
  if (endExclusive < period) return null;
  return avg(closes.slice(endExclusive - period, endExclusive));
}

// ATR14 — lib/risk-filter.ts의 atr()와 같은 공식(단순평균 True Range). 그 파일은
// candidate-detail → prisma·Anthropic까지 끌고 와서 순수 모듈에서 import할 수 없다.
export function atr14(candles: ChartCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }
  return sum / period;
}

function priceRange(candles: ChartCandle[], label: PriceRange["label"], days: number, price: number): PriceRange | null {
  const w = candles.slice(-days);
  if (w.length === 0) return null;
  let hi = w[0];
  let lo = w[0];
  for (const c of w) {
    if (c.high >= hi.high) hi = c; // 같은 값이면 더 최근 날짜
    if (c.low <= lo.low) lo = c;
  }
  return {
    label,
    days: w.length,
    high: hi.high,
    highDate: hi.date,
    low: lo.low,
    lowDate: lo.date,
    fromHighPct: hi.high > 0 ? ((price - hi.high) / hi.high) * 100 : 0,
    fromLowPct: lo.low > 0 ? ((price - lo.low) / lo.low) * 100 : 0,
  };
}

function bollingerDetail(candles: ChartCandle[]): BollingerDetail | null {
  const b = computeBollinger(candles);
  if (!b.latest) return null;
  const last = candles[candles.length - 1];
  const touch = last.high >= b.latest.upper ? "상단 터치" : last.low <= b.latest.lower ? "하단 터치" : null;

  // 밴드워크: 상단(또는 하단) 근접 이상인 날이 오늘까지 연속 몇 거래일인지
  const zoneSide = (p: number | null) => (p === null ? null : p >= 0.8 ? "up" : p <= 0.2 ? "down" : null);
  const side = zoneSide(b.latest.percentB);
  let walkDays = 0;
  if (side) {
    for (let i = b.series.length - 1; i >= 0 && zoneSide(b.series[i].percentB) === side; i--) walkDays++;
  }
  const walk: BandPosition = side && walkDays >= WALK_MIN_DAYS ? (side === "up" ? "상단 밴드워크" : "하단 밴드워크") : null;

  // 최근 20거래일 안에 하단을 이탈한 사건만 — 몇 달 전 이탈까지 끌어오면 지금과 상관없는 신호가 된다
  const recentDates = new Set(b.series.slice(-REENTRY_RECENT_DAYS).map((p) => p.date));
  const reentry = b.recentReentry && recentDates.has(b.recentReentry.breachDate) ? b.recentReentry : null;

  return {
    upper: b.latest.upper,
    middle: b.latest.middle,
    lower: b.latest.lower,
    percentB: b.latest.percentB,
    zone: b.latest.percentB === null ? null : percentBZone(b.latest.percentB),
    bandWidthPct: b.latest.bandWidthPct,
    bandWidthPercentile: b.bandWidthPercentile,
    squeeze: b.squeeze,
    slope: b.slope,
    touch,
    walk,
    walkDays: walk ? walkDays : 0,
    reentry,
  };
}

// price: 실시간 현재가(없으면 마지막 일봉 종가). 장중엔 마지막 일봉이 진행 중인
// 오늘 캔들이라 종가 = 그 시점 현재가와 거의 같다 — 이평·볼린저는 그 값으로 계산한다.
export function computeChartDetail(candles: ChartCandle[], price: number): ChartDetail | null {
  if (candles.length === 0 || price <= 0) return null;
  const closes = candles.map((c) => c.close);
  const n = closes.length;

  const mas: MaLine[] = [];
  const missingMas: MaPeriod[] = [];
  for (const period of MA_PERIODS) {
    const value = maAt(closes, period, n);
    if (value === null || value <= 0) {
      missingMas.push(period);
      continue;
    }
    const past = maAt(closes, period, n - SLOPE_LOOKBACK);
    const slopePct = past !== null && past > 0 ? ((value - past) / past) * 100 : null;
    mas.push({ period, value, gapPct: (price / value - 1) * 100, slopePct, trend: trendOf(slopePct) });
  }

  let alignment: ChartDetail["alignment"] = null;
  if (mas.length === MA_PERIODS.length) {
    const v = mas.map((m) => m.value); // 5, 20, 60, 120 순
    if (v[0] > v[1] && v[1] > v[2] && v[2] > v[3]) alignment = "정배열";
    else if (v[0] < v[1] && v[1] < v[2] && v[2] < v[3]) alignment = "역배열";
    else alignment = "혼조";
  }

  const ranges = [
    priceRange(candles, "20일", 20, price),
    priceRange(candles, "60일", 60, price),
    priceRange(candles, "52주", 250, price),
  ].filter((r): r is PriceRange => r !== null);

  // 지지/저항: 오늘을 뺀 최근 1년 스윙 고점·저점(lib/technical-signals.ts와 같은 방식).
  // 오늘 캔들이 피벗 후보가 되면 "오늘 가격이 오늘 가격의 지지선"이 되는 순환이 생긴다.
  const levels = findSupportResistanceLevels(candles.slice(-LEVEL_LOOKBACK - 1, -1));
  const near = nearestSupportResistance(levels, price);
  const toLevel = (l: { price: number; touches: number } | null): Level | null =>
    l ? { price: l.price, touches: l.touches, distancePct: ((l.price - price) / price) * 100 } : null;

  const prior = candles.slice(-21, -1);
  let prior20Low: ChartDetail["prior20Low"] = null;
  if (prior.length === 20) {
    const lo = prior.reduce((m, c) => (c.low <= m.low ? c : m), prior[0]);
    prior20Low = { price: lo.low, date: lo.date };
  }

  const atrValue = atr14(candles);
  return {
    asOfDate: candles[n - 1].date,
    price,
    mas,
    missingMas,
    alignment,
    ranges,
    prior20Low,
    support: toLevel(near.support),
    resistance: toLevel(near.resistance),
    rsi14: rsi(closes),
    atr14: atrValue,
    atrPct: atrValue !== null ? (atrValue / price) * 100 : null,
    bollinger: bollingerDetail(candles),
  };
}

// ---------------------------------------------------------------- 거래량

export type VolumeDetail = {
  latestDate: string;
  partial: boolean; // 장중 — latestVolume은 하루치의 일부(누적)
  latestVolume: number;
  latestTradingValue: number | null;
  avg20Volume: number | null; // 완결된 직전 20거래일 평균(오늘 제외)
  vsAvg20Pct: number | null; // 완결된 날끼리만 비교 — 장중엔 null(장중 누적과 하루 평균을 그대로 비교하지 않는다)
  progressPct: number | null; // 장중: 오늘 누적 / 20일 평균 ×100 (참고용 진행률)
  sessionElapsedPct: number | null; // 장중: 정규장 390분 중 경과 비율 — 진행률을 읽는 기준
  avg5TradingValue: number | null; // 완결된 직전 5거래일 평균 거래대금
  upDayAvgVolume: number | null; // 완결된 최근 20거래일 중 상승일 평균 거래량
  downDayAvgVolume: number | null;
  upDays: number;
  downDays: number;
};

const REGULAR_SESSION_MINUTES = 390; // 09:00~15:30

// minutesSinceOpen: 장중일 때 09:00부터 지난 분(호출부가 KST로 계산해서 넘긴다).
export function computeVolumeDetail(
  candles: ChartCandle[],
  opts: { lastCandlePartial: boolean; quote: KisQuote | null; minutesSinceOpen: number | null }
): VolumeDetail | null {
  if (candles.length === 0) return null;
  const partial = opts.lastCandlePartial;
  const last = candles[candles.length - 1];
  // 장중엔 시세 API의 누적 거래량이 일봉보다 조금 더 최신이라 그쪽을 쓴다.
  const latestVolume = partial && opts.quote ? opts.quote.volume : last.volume;
  const latestTradingValue = partial && opts.quote ? opts.quote.tradingValue : (last.tradingValue ?? null);

  // 비교 기준은 "오늘(최신 캔들)을 뺀 완결된 거래일"
  const completed = candles.slice(0, -1);
  const prior20 = completed.slice(-20);
  const avg20Volume = prior20.length >= 20 ? avg(prior20.map((c) => c.volume)) : null;

  const prior5 = completed.slice(-5);
  const tv5 = prior5.map((c) => c.tradingValue).filter((v): v is number => typeof v === "number" && v > 0);
  const avg5TradingValue = prior5.length === 5 && tv5.length === 5 ? avg(tv5) : null;

  // 상승일/하락일 거래량 — 장중이면 오늘을 빼고, 마감 후면 오늘까지 넣은 최근 20거래일
  const window = (partial ? completed : candles).slice(-21);
  const up: number[] = [];
  const down: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i].close > window[i - 1].close) up.push(window[i].volume);
    else if (window[i].close < window[i - 1].close) down.push(window[i].volume);
  }

  const vsAvg20Pct = !partial && avg20Volume && avg20Volume > 0 ? (latestVolume / avg20Volume - 1) * 100 : null;
  const progressPct = partial && avg20Volume && avg20Volume > 0 ? (latestVolume / avg20Volume) * 100 : null;
  const sessionElapsedPct =
    partial && opts.minutesSinceOpen !== null ? Math.min(100, Math.max(0, (opts.minutesSinceOpen / REGULAR_SESSION_MINUTES) * 100)) : null;

  return {
    latestDate: last.date,
    partial,
    latestVolume,
    latestTradingValue: latestTradingValue && latestTradingValue > 0 ? latestTradingValue : null,
    avg20Volume,
    vsAvg20Pct,
    progressPct,
    sessionElapsedPct,
    avg5TradingValue,
    upDayAvgVolume: up.length > 0 ? avg(up) : null,
    downDayAvgVolume: down.length > 0 ? avg(down) : null,
    upDays: up.length,
    downDays: down.length,
  };
}

// ---------------------------------------------------------------- 수급

export type InvestorKey = "foreign" | "institution" | "individual";
export const INVESTOR_LABEL: Record<InvestorKey, string> = { foreign: "외국인", institution: "기관", individual: "개인" };

export type FlowSum = { days: number; qty: number; amount: number; pctOfVolume: number | null };

export type InvestorFlow = {
  key: InvestorKey;
  latest: { date: string; qty: number; amount: number } | null;
  sum5: FlowSum | null;
  sum20: FlowSum | null;
  streak: { direction: "순매수" | "순매도"; days: number } | null; // 최신일부터 같은 방향이 이어진 거래일 수
};

// 외국인·기관이 "같은 날 둘 다" 같은 방향으로 판 날이 최신일부터 며칠 이어졌는지 —
// 각자의 연속일수(InvestorFlow.streak)와 달리 동반 매도/매수만 센다.
export type JointStreak = { direction: "동반 순매도" | "동반 순매수"; days: number; startDate: string; endDate: string };

export type FlowDetail = {
  asOfDate: string | null; // 수급 데이터의 마지막 집계일(장중엔 보통 전 거래일)
  days: number; // 받아온 거래일 수
  investors: InvestorFlow[];
  joint: JointStreak | null;
};

const QTY_KEY: Record<InvestorKey, "foreignQty" | "institutionQty" | "individualQty"> = {
  foreign: "foreignQty",
  institution: "institutionQty",
  individual: "individualQty",
};

// rows: 최신순(fetchInvestorTrend 그대로, skipUnreported로 미집계 행은 이미 빠짐).
// candles: 같은 날짜의 거래량으로 "거래량 대비 순매수 비율"을 낸다 — 금액(백만원
// 단위 반올림)보다 수량끼리 나누는 게 정확하다.
export function computeFlowDetail(rows: InvestorTrendRow[], candles: ChartCandle[]): FlowDetail {
  const volumeByDate = new Map(candles.map((c) => [c.date, c.volume]));

  const sumOver = (key: InvestorKey, n: number): FlowSum | null => {
    if (rows.length < n) return null;
    const w = rows.slice(0, n);
    const qty = w.reduce((s, r) => s + r[QTY_KEY[key]], 0);
    const amount = w.reduce((s, r) => s + r[key], 0);
    const vols = w.map((r) => volumeByDate.get(r.date));
    const totalVol = vols.every((v): v is number => typeof v === "number") ? vols.reduce((s, v) => s + v, 0) : null;
    return { days: n, qty, amount, pctOfVolume: totalVol && totalVol > 0 ? (qty / totalVol) * 100 : null };
  };

  const investors: InvestorFlow[] = (["foreign", "institution", "individual"] as InvestorKey[]).map((key) => {
    const first = rows[0];
    let streak: InvestorFlow["streak"] = null;
    if (first && first[QTY_KEY[key]] !== 0) {
      const sign = Math.sign(first[QTY_KEY[key]]);
      let days = 0;
      for (const r of rows) {
        if (Math.sign(r[QTY_KEY[key]]) !== sign) break;
        days++;
      }
      streak = { direction: sign > 0 ? "순매수" : "순매도", days };
    }
    return {
      key,
      latest: first ? { date: first.date, qty: first[QTY_KEY[key]], amount: first[key] } : null,
      sum5: sumOver(key, 5),
      sum20: sumOver(key, 20),
      streak,
    };
  });

  let joint: JointStreak | null = null;
  const sideOf = (r: InvestorTrendRow) => (r.foreignQty < 0 && r.institutionQty < 0 ? -1 : r.foreignQty > 0 && r.institutionQty > 0 ? 1 : 0);
  const side = rows[0] ? sideOf(rows[0]) : 0;
  if (side !== 0) {
    let n = 0;
    while (n < rows.length && sideOf(rows[n]) === side) n++;
    joint = { direction: side < 0 ? "동반 순매도" : "동반 순매수", days: n, startDate: rows[n - 1].date, endDate: rows[0].date };
  }

  return { asOfDate: rows[0]?.date ?? null, days: rows.length, investors, joint };
}

export type HoldingDetail = {
  chart: ChartDetail | null;
  volume: VolumeDetail | null;
  flow: FlowDetail;
  financials: FinancialYear[]; // KRX 연간 재무(최근 3개년) — 등급의 재무 신호와 같은 원천
};
