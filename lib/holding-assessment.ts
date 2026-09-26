// 둥지 "AI 골구 종목 진단"의 계산·판정 엔진 — 숫자와 판정은 전부 여기서 규칙으로
// 정하고, AI(lib/portfolio-advisor.ts)는 이 결과를 설명만 한다(입력에 없는 숫자를
// 만들지 않게). prisma/네트워크 의존이 없는 순수 함수만 둬서 서버·클라이언트
// 어디서든 import할 수 있고, 데이터를 가져오는 쪽은 lib/holding-assessment-store.ts.
//
// ⚠️ 아래 신호 점수·상태 임계값은 "초안"이다 — 실제 성과로 검증된 값이 아니라
// 상식적인 규칙을 처음 정해본 것이라, 화면에도 "규칙 기반 초안"이라고 표시하고
// 실제 보유종목에서 판정이 말이 되는지 사용자가 보며 조정한다. 단일 종합 점수
// (예: 87/100)는 일부러 만들지 않는다 — 가중치가 임의라 정밀해 보이는 착시만
// 주기 때문에, 신호별 색과 근거를 그대로 보여준다.

export type AssessmentState = "유지" | "관찰" | "축소검토" | "정밀점검";

export const STATE_RANK: Record<AssessmentState, number> = { 유지: 0, 관찰: 1, 축소검토: 2, 정밀점검: 3 };
export const STATE_ICON: Record<AssessmentState, string> = { 유지: "🟢", 관찰: "🟡", 축소검토: "🟠", 정밀점검: "🔴" };

export type SignalKey = "chart" | "flow" | "volume" | "financial";

export type Signal = {
  key: SignalKey;
  label: string;
  score: number | null; // null = 데이터 없음(판정에서 제외)
  note: string;
};

export type Candle = { date: string; high: number; low: number; close: number; volume: number };
export type FlowRow = { foreign: number; institution: number };
export type FinancialYear = { year: number; operatingProfit: number; netIncome: number; totalEquity: number };

// 원금 회복에 필요한 수익률 — -50%면 +100%, -70%면 +233.3%, -80%면 +400%.
// 손실이 아니면(0 이상) 회복할 게 없어 null.
export function recoveryNeededPct(changePct: number | null): number | null {
  if (changePct === null || changePct >= 0 || changePct <= -100) return null;
  return (100 / (100 + changePct) - 1) * 100;
}

export type HoldingRow = { name: string; code: string; buyPrice: number; quantity: number; buyDate?: string | null };
export type AggregatedHolding = {
  name: string;
  code: string;
  avgBuyPrice: number;
  quantity: number;
  firstBuyDate: string | null; // 여러 번 나눠 샀으면 가장 이른 매수일. 매수일을 안 넣은 건은 무시
};

// 두 YYYY-MM-DD 사이의 일수(to - from). 날짜 형식이 아니면 null.
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

// 보유 일수 → "12일", "3개월", "1년 2개월". 30일 단위 근사가 아니라 달력 기준에 가깝게
// 개월은 30.4일로 나눈다(정밀한 만기 계산이 아니라 "얼마나 들고 있었나" 감을 주는 용도).
export function holdingPeriodLabel(days: number | null): string {
  if (days === null || days < 0) return "-";
  if (days < 30) return `${days}일`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `${months}개월`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest > 0 ? `${years}년 ${rest}개월` : `${years}년`;
}

// 같은 종목을 여러 번 나눠 샀으면 평균단가(수량 가중)로 합쳐서 판단한다 —
// 저장은 매수 건별로 따로 두지만(손절가/목표가가 매수 시점 맥락에 의미가
// 있어서), 진단은 "이 종목 전체를 계속 들고 갈 근거가 있나"라 종목 단위.
export function aggregateHoldings(rows: HoldingRow[]): AggregatedHolding[] {
  const byCode = new Map<string, { name: string; cost: number; quantity: number; firstBuyDate: string | null }>();
  for (const r of rows) {
    const cur = byCode.get(r.code) ?? { name: r.name, cost: 0, quantity: 0, firstBuyDate: null };
    cur.cost += r.buyPrice * r.quantity;
    cur.quantity += r.quantity;
    if (r.buyDate && (!cur.firstBuyDate || r.buyDate < cur.firstBuyDate)) cur.firstBuyDate = r.buyDate;
    byCode.set(r.code, cur);
  }
  return [...byCode.entries()].map(([code, v]) => ({
    name: v.name,
    code,
    avgBuyPrice: v.quantity > 0 ? v.cost / v.quantity : 0,
    quantity: v.quantity,
    firstBuyDate: v.firstBuyDate,
  }));
}

export type TechMetrics = {
  ret1m: number | null;
  ret3m: number | null;
  ret1y: number | null;
  fromHigh52w: number | null; // 52주(최근 250거래일) 고점 대비 %, 항상 0 이하
  ma20: number | null;
  ma60: number | null;
  volumeRatio: number | null; // 최근 5거래일 평균 / 그 직전 20거래일 평균
};

function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const s = values.slice(-n);
  return s.reduce((a, b) => a + b, 0) / n;
}

function retOver(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const past = closes[closes.length - 1 - days];
  return past > 0 ? ((closes[closes.length - 1] - past) / past) * 100 : null;
}

export function computeTechMetrics(candles: Candle[]): TechMetrics {
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1];
  const window = candles.slice(-250);
  const high = window.length > 0 ? Math.max(...window.map((c) => c.high)) : null;

  let volumeRatio: number | null = null;
  if (candles.length >= 25) {
    const recent = candles.slice(-5).reduce((s, c) => s + c.volume, 0) / 5;
    const base = candles.slice(-25, -5).reduce((s, c) => s + c.volume, 0) / 20;
    volumeRatio = base > 0 ? recent / base : null;
  }

  return {
    ret1m: retOver(closes, 21),
    ret3m: retOver(closes, 63),
    ret1y: retOver(closes, 250),
    fromHigh52w: high && last ? ((last - high) / high) * 100 : null,
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
    volumeRatio,
  };
}

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

// 차트: 20일선/60일선 위·아래. 둘 다 아래면 추세 붕괴, 둘 다 위면 양호.
function chartSignal(price: number, m: TechMetrics): Signal {
  const label = "차트";
  if (m.ma20 === null) return { key: "chart", label, score: null, note: "이동평균을 계산할 데이터가 부족해요" };
  const above20 = price >= m.ma20;
  const above60 = m.ma60 === null ? null : price >= m.ma60;
  if (above60 === null) {
    return { key: "chart", label, score: above20 ? 1 : -1, note: above20 ? "20일선 위" : "20일선 아래(60일선은 데이터 부족)" };
  }
  if (above20 && above60) return { key: "chart", label, score: 1, note: "20일선·60일선 모두 위 — 추세 양호" };
  if (!above20 && !above60) return { key: "chart", label, score: -2, note: "20일선·60일선 모두 아래 — 추세 약세" };
  return { key: "chart", label, score: -1, note: above60 ? "20일선 아래, 60일선 위 — 단기 조정" : "20일선 위, 60일선 아래 — 반등 중이지만 중기 추세는 약세" };
}

// 수급: 최근 5거래일 외국인·기관 순매수 합계 부호. 둘 다 팔면 -2, 둘 다 사면 +2.
function flowSignal(rows: FlowRow[]): Signal {
  const label = "수급";
  if (rows.length === 0) return { key: "flow", label, score: null, note: "수급 데이터를 가져오지 못했어요" };
  const f = Math.sign(rows.slice(0, 5).reduce((s, r) => s + r.foreign, 0));
  const i = Math.sign(rows.slice(0, 5).reduce((s, r) => s + r.institution, 0));
  if (f < 0 && i < 0) return { key: "flow", label, score: -2, note: "최근 5거래일 외국인·기관 모두 순매도" };
  if (f > 0 && i > 0) return { key: "flow", label, score: 2, note: "최근 5거래일 외국인·기관 모두 순매수" };
  if (f + i < 0) return { key: "flow", label, score: -1, note: "최근 5거래일 외국인·기관 중 매도 우위" };
  if (f + i > 0) return { key: "flow", label, score: 1, note: "최근 5거래일 외국인·기관 중 매수 우위" };
  return { key: "flow", label, score: 0, note: "최근 5거래일 외국인·기관 수급이 엇갈림" };
}

// 거래량: 줄면 관심 이탈(-1), 크게 늘었는데 차트가 양호하면 +1. 하락 중 거래량 증가는
// 오히려 매도세일 수 있어 점수를 주지 않는다.
function volumeSignal(m: TechMetrics, chartScore: number | null): Signal {
  const label = "거래량";
  if (m.volumeRatio === null) return { key: "volume", label, score: null, note: "거래량을 비교할 데이터가 부족해요" };
  const pct = (m.volumeRatio - 1) * 100;
  if (m.volumeRatio <= 0.7) return { key: "volume", label, score: -1, note: `평소 대비 ${fmtPct(pct)} — 관심 이탈` };
  if (m.volumeRatio >= 1.5 && chartScore !== null && chartScore > 0) return { key: "volume", label, score: 1, note: `평소 대비 ${fmtPct(pct)} — 상승 추세에 거래 증가` };
  return { key: "volume", label, score: 0, note: `평소 대비 ${fmtPct(pct)}` };
}

// 재무: 최근 완결 연도 기준 영업이익·순이익 흑자 여부, 자본총계 0 이하(자본잠식)는 최우선.
function financialSignal(history: FinancialYear[]): Signal {
  const label = "재무";
  if (history.length === 0) return { key: "financial", label, score: null, note: "재무 데이터를 확인하지 못했어요" };
  const latest = [...history].sort((a, b) => a.year - b.year)[history.length - 1];
  if (latest.totalEquity <= 0) return { key: "financial", label, score: -2, note: `${latest.year}년 자본총계가 0 이하 — 자본잠식 가능성` };
  const op = latest.operatingProfit >= 0;
  const net = latest.netIncome >= 0;
  if (op && net) return { key: "financial", label, score: 1, note: `${latest.year}년 영업이익·순이익 모두 흑자` };
  if (!op && !net) return { key: "financial", label, score: -2, note: `${latest.year}년 영업이익·순이익 모두 적자` };
  return { key: "financial", label, score: -1, note: `${latest.year}년 ${op ? "순이익" : "영업이익"} 적자` };
}

export type AssessmentInput = {
  name: string;
  code: string;
  avgBuyPrice: number;
  quantity: number;
  currentPrice: number;
  candles: Candle[];
  flows: FlowRow[];
  financials: FinancialYear[];
  portfolioValuation: number; // 전체 포트폴리오 평가액(현금·채권 포함) — 비중 계산 기준
  holdingDays?: number | null; // 첫 매수일부터 오늘까지 — 판정에는 쓰지 않고 보여주기만 한다
  firstBuyDate?: string | null;
};

export type HoldingAssessment = {
  code: string;
  name: string;
  state: AssessmentState;
  signals: Signal[];
  totalScore: number; // 점수가 있는 신호의 합 — 상태 판정용 내부값, 화면에 종합 점수로 내세우지 않는다
  avgBuyPrice: number;
  currentPrice: number;
  quantity: number;
  valuation: number;
  changePct: number | null;
  lossAmount: number; // 평가손실 금액(손실일 때만 양수)
  recoveryNeededPct: number | null;
  weightPct: number | null;
  firstBuyDate: string | null;
  holdingDays: number | null;
  tech: TechMetrics;
  stateNote: string; // 왜 이 상태인지 한 줄
};

const ORDER: AssessmentState[] = ["유지", "관찰", "축소검토", "정밀점검"];
const up = (s: AssessmentState): AssessmentState => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(s) + 1)];

// 상태 판정 규칙(초안):
//   신호 합계(차트·수급·거래량·재무, 각 -2~+2) → ≥2 유지 / 0~1 관찰 / -1~-3 축소검토 / ≤-4 정밀점검
//   신호가 2개 미만이면 판단 근거가 부족해 관찰
//   -50% 이하 깊은 손실이면 한 단계 위험쪽으로(손실률만으로 매도 판정은 하지 않되,
//   회복에 필요한 수익률이 커서 "더 보수적으로 점검"하라는 뜻)
export function assessHolding(input: AssessmentInput): HoldingAssessment {
  const tech = computeTechMetrics(input.candles);
  const chart = chartSignal(input.currentPrice, tech);
  const signals: Signal[] = [
    chart,
    flowSignal(input.flows),
    volumeSignal(tech, chart.score),
    financialSignal(input.financials),
  ];

  const scored = signals.filter((s) => s.score !== null);
  const totalScore = scored.reduce((sum, s) => sum + (s.score as number), 0);
  const changePct = input.avgBuyPrice > 0 ? ((input.currentPrice - input.avgBuyPrice) / input.avgBuyPrice) * 100 : null;

  let state: AssessmentState;
  let stateNote: string;
  if (scored.length < 2) {
    state = "관찰";
    stateNote = "판단에 쓸 수 있는 신호가 2개 미만이라 관찰로 둬요";
  } else if (totalScore >= 2) {
    state = "유지";
    stateNote = `신호 합계 ${totalScore >= 0 ? "+" : ""}${totalScore}`;
  } else if (totalScore >= 0) {
    state = "관찰";
    stateNote = `신호 합계 ${totalScore >= 0 ? "+" : ""}${totalScore} — 뚜렷한 방향 없음`;
  } else if (totalScore >= -3) {
    state = "축소검토";
    stateNote = `신호 합계 ${totalScore} — 약세 신호 우세`;
  } else {
    state = "정밀점검";
    stateNote = `신호 합계 ${totalScore} — 약세 신호가 겹침`;
  }

  if (changePct !== null && changePct <= -50 && state !== "정밀점검") {
    state = up(state);
    stateNote += ` · 손실 ${fmtPct(changePct)}로 깊어 한 단계 보수적으로 조정`;
  }

  const valuation = input.currentPrice * input.quantity;
  return {
    code: input.code,
    name: input.name,
    state,
    signals,
    totalScore,
    avgBuyPrice: input.avgBuyPrice,
    currentPrice: input.currentPrice,
    quantity: input.quantity,
    valuation,
    changePct,
    lossAmount: Math.max(0, (input.avgBuyPrice - input.currentPrice) * input.quantity),
    recoveryNeededPct: recoveryNeededPct(changePct),
    weightPct: input.portfolioValuation > 0 ? (valuation / input.portfolioValuation) * 100 : null,
    firstBuyDate: input.firstBuyDate ?? null,
    holdingDays: input.holdingDays ?? null,
    tech,
    stateNote,
  };
}

// 화면 정렬용: 위험한 상태 먼저, 같은 상태면 평가손실 금액이 큰 것 먼저.
export function sortByPriority(list: HoldingAssessment[]): HoldingAssessment[] {
  return [...list].sort((a, b) => STATE_RANK[b.state] - STATE_RANK[a.state] || b.lossAmount - a.lossAmount);
}

export type PortfolioFlag = { level: "high" | "medium"; text: string };

// 포트폴리오 전체 위험 — 종합 점수 대신 "어떤 위험이 있는지"를 규칙 문장으로.
export function portfolioFlags(params: {
  stockPct: number;
  buffersPct: number; // 채권+대체+현금 비중 합
  cashPct: number;
  holdings: HoldingAssessment[];
  stockValuation: number;
}): PortfolioFlag[] {
  const flags: PortfolioFlag[] = [];
  const { stockPct, buffersPct, cashPct, holdings, stockValuation } = params;

  if (stockPct >= 90 && buffersPct <= 10) {
    flags.push({ level: "high", text: `주식이 전체의 ${stockPct.toFixed(0)}%이고 채권·대체자산·현금은 합쳐 ${buffersPct.toFixed(0)}%예요 — 완충 자산이 거의 없어요` });
  } else if (cashPct < 5 && stockPct >= 70) {
    flags.push({ level: "medium", text: `현금이 ${cashPct.toFixed(0)}%로 적어서 하락 시 대응할 여력이 작아요` });
  }

  const byWeight = [...holdings].filter((h) => h.weightPct !== null).sort((a, b) => (b.weightPct as number) - (a.weightPct as number));
  const top = byWeight[0];
  if (top && (top.weightPct as number) >= 30) {
    flags.push({
      level: (top.weightPct as number) >= 50 ? "high" : "medium",
      text: `${top.name} 한 종목이 전체 자산의 ${(top.weightPct as number).toFixed(0)}%를 차지해요`,
    });
  }

  const deep = holdings.filter((h) => h.changePct !== null && h.changePct <= -50);
  if (deep.length > 0 && stockValuation > 0) {
    const share = (deep.reduce((s, h) => s + h.valuation, 0) / stockValuation) * 100;
    const lossTotal = deep.reduce((s, h) => s + h.lossAmount, 0);
    flags.push({
      level: share >= 20 ? "high" : "medium",
      text: `-50% 이하 손실 종목이 ${deep.length}개(${deep.map((d) => d.name).join(", ")}), 주식 평가액의 ${share.toFixed(0)}%예요. 이 종목들의 평가손실은 합쳐 ${Math.round(lossTotal).toLocaleString()}원이에요`,
    });
  }
  return flags;
}
