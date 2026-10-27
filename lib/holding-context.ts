// 보유종목 알림 C단계(사용자 스펙 2026-10-27 6~8번) — 뉴스·공시 분류, 오늘 움직임의
// 시장/업종/종목 원인 분리, 조건별 시나리오. 전부 규칙 기반 순수 함수(LLM·DB·
// 네트워크 없음)라 tests/holding-context.test.ts로 바로 검증한다. 데이터를 가져오는
// 쪽은 lib/holding-context-store.ts.
//
// 원칙: 조회에 실패한 건 "없음"으로 바꾸지 않는다(ok=false를 그대로 들고 다님).
// 시나리오는 예측이 아니라 "이 가격에서 이렇게 되면 이걸 확인" 하는 조건표이고,
// "당장 매도"/"무조건 추가매수" 같은 단정 표현은 쓰지 않는다.

import type { NewsItem } from "@/lib/naver-news";
import type { DilutionFiling } from "@/lib/dart";
import type { ChartDetail, VolumeDetail } from "@/lib/holding-detail";

// ---------------------------------------------------------------- 공시

export type FilingSeverity = "긴급" | "주의" | "참고";
export type ClassifiedFiling = DilutionFiling & { category: string; severity: FilingSeverity };

// 제목 키워드로만 가르는 초안 — 정정·취소 공시도 같이 잡힐 수 있어 "이런 공시가
// 있었다"까지만 말하고 영향은 원문 확인을 권한다(lib/dart.ts DILUTION_KEYWORDS와 같은 태도).
// 위에서부터 처음 맞는 규칙 하나만 적용.
const FILING_RULES: { re: RegExp; category: string; severity: FilingSeverity }[] = [
  { re: /매매거래정지|거래정지/, category: "거래정지", severity: "긴급" },
  { re: /상장폐지|상장적격성/, category: "상장폐지 관련", severity: "긴급" },
  { re: /의견거절|부적정|한정의견|감사의견/, category: "감사의견", severity: "긴급" },
  { re: /관리종목/, category: "관리종목", severity: "긴급" },
  { re: /횡령|배임/, category: "횡령·배임", severity: "긴급" },
  { re: /회생절차|파산|부도|영업정지/, category: "회생·부도·영업정지", severity: "긴급" },
  { re: /불성실공시|투자주의환기|투자경고|투자위험/, category: "시장 경고", severity: "주의" },
  { re: /전환사채|신주인수권부사채|교환사채|유상증자|제3자배정|주주배정/, category: "주식 희석(CB·BW·유상증자)", severity: "주의" },
  { re: /감자/, category: "감자", severity: "주의" },
  { re: /최대주주\s?변경|경영권/, category: "최대주주 변경", severity: "주의" },
  { re: /소송/, category: "소송", severity: "주의" },
  { re: /잠정\)?실적|매출액또는손익구조|영업실적/, category: "실적", severity: "참고" },
  { re: /단일판매|공급계약|수주/, category: "계약·수주", severity: "참고" },
  { re: /자기주식|자사주/, category: "자사주", severity: "참고" },
];

const SEVERITY_RANK: Record<FilingSeverity, number> = { 긴급: 0, 주의: 1, 참고: 2 };

export function classifyFiling(f: DilutionFiling): ClassifiedFiling | null {
  const rule = FILING_RULES.find((r) => r.re.test(f.reportName));
  return rule ? { ...f, category: rule.category, severity: rule.severity } : null;
}

// 중요 공시만(규칙에 걸린 것), 심각한 것 먼저·같은 등급이면 최신 먼저.
export function importantFilings(filings: DilutionFiling[], limit = 8): ClassifiedFiling[] {
  return filings
    .map(classifyFiling)
    .filter((f): f is ClassifiedFiling => f !== null)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.reportDate.localeCompare(a.reportDate))
    .slice(0, limit);
}

// ---------------------------------------------------------------- 뉴스

const DAY_MS = 86_400_000;

// 최근 N일, 제목이나 요약에 종목명이 실제로 들어간 기사만(네이버 검색은 이름이
// 겹치는 다른 회사·무관한 기사도 섞여 나온다). 같은 제목은 한 번만. 제목에
// 종목명이 있는 기사를 먼저 — 요약에만 있는 건 "코스피 급등… ○○ 등 강세" 같은
// 시황 기사가 많아서 뒤로 보낸다(2026-10-27 실데이터 미리보기에서 확인).
export function recentRelevantNews(stockName: string, items: NewsItem[], nowMs: number, days = 7, limit = 5): NewsItem[] {
  const key = stockName.replace(/\s/g, "");
  const seen = new Set<string>();
  const inTitle = (n: NewsItem) => n.title.replace(/\s/g, "").includes(key);
  return items
    .filter((n) => {
      const t = Date.parse(n.pubDate);
      if (Number.isNaN(t) || nowMs - t > days * DAY_MS || t - nowMs > DAY_MS) return false;
      if (!`${n.title}${n.description}`.replace(/\s/g, "").includes(key)) return false;
      const norm = n.title.replace(/\s/g, "");
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    })
    .sort((a, b) => Number(inTitle(b)) - Number(inTitle(a)) || b.pubDate.localeCompare(a.pubDate))
    .slice(0, limit);
}

// ---------------------------------------------------------------- 원인 분리

export type MoveDecomposition = {
  stockPct: number | null;
  market: { name: string; pct: number } | null;
  sector: { name: string; avgPct: number; peers: number; asOf: string; selfPct?: number | null } | null;
  vsMarketPp: number | null; // 종목 - 지수 (%p)
  vsSectorPp: number | null;
  verdict: string;
};

const GAP_PP = 2; // 시장·업종과 2%p 이상 차이 나야 "다르게 움직였다"고 본다

// sector.selfPct: 업종 평균과 같은 시점(테마 집계 시각)의 이 종목 등락 — 있으면 그걸로
// 비교한다. 업종 집계는 장중 몇 시간 전 값일 수 있어서, 지금 시세와 그때 업종 평균을
// 비교하면 시점이 어긋난다. 시장 지수는 알림 시점에 같이 조회하므로 지금 시세와 비교.
export function decomposeMove(p: {
  stockPct: number | null;
  market: { name: string; pct: number } | null;
  sector: { name: string; avgPct: number; peers: number; asOf: string; selfPct?: number | null } | null;
}): MoveDecomposition {
  const vsMarketPp = p.stockPct !== null && p.market ? p.stockPct - p.market.pct : null;
  const sectorSelf = p.sector?.selfPct ?? p.stockPct;
  const vsSectorPp = sectorSelf !== null && p.sector ? sectorSelf - p.sector.avgPct : null;
  const weak = (x: number | null) => x !== null && x <= -GAP_PP;
  const strong = (x: number | null) => x !== null && x >= GAP_PP;
  const similar = (x: number | null) => x !== null && Math.abs(x) < GAP_PP;

  let verdict: string;
  if (p.stockPct === null) verdict = "오늘 등락을 확인하지 못해 원인을 나눌 수 없어요";
  else if (vsMarketPp === null && vsSectorPp === null) verdict = "비교할 지수·업종 데이터가 없어 원인을 나눌 수 없어요";
  else if (weak(vsMarketPp) && (vsSectorPp === null || weak(vsSectorPp)))
    verdict = `${p.sector ? "시장·업종" : "시장"}보다 약해요 — 종목 자체 요인일 가능성이 있어 뉴스·공시 확인이 필요해요`;
  else if (weak(vsMarketPp) && similar(vsSectorPp)) verdict = "시장보다 약하지만 업종과는 비슷해요 — 업종 전반의 약세 영향으로 보여요";
  else if (similar(vsMarketPp) && weak(vsSectorPp)) verdict = "시장과는 비슷하지만 업종 평균보다 약해요";
  else if (strong(vsMarketPp) && (vsSectorPp === null || strong(vsSectorPp))) verdict = `${p.sector ? "시장·업종" : "시장"}보다 강해요 — 종목 자체 강세`;
  else if (strong(vsMarketPp) && similar(vsSectorPp)) verdict = "업종과 함께 시장보다 강해요 — 업종 강세 영향으로 보여요";
  else if (similar(vsMarketPp) && strong(vsSectorPp)) verdict = "시장과는 비슷하고 업종 평균보다는 강해요";
  else if (vsMarketPp === null && weak(vsSectorPp)) verdict = "업종 평균보다 약해요 — 종목 자체 요인일 가능성이 있어요";
  else if (vsMarketPp === null && strong(vsSectorPp)) verdict = "업종 평균보다 강해요";
  else {
    const base = vsMarketPp !== null && vsSectorPp !== null ? "시장·업종" : vsMarketPp !== null ? "시장" : "업종";
    verdict = `${base}과 비슷하게 움직였어요${p.stockPct < 0 ? " — 개별 악재보다는 전체 하락 흐름의 영향으로 보여요" : ""}`;
  }

  return { stockPct: p.stockPct, market: p.market, sector: p.sector, vsMarketPp, vsSectorPp, verdict };
}

// 같은 테마 다른 종목들의 오늘 등락 평균(본인 제외). 3종목 미만이면 평균이
// 대표성이 없어 null.
export function sectorAverage(peers: { code: string; changePct: number }[], selfCode: string): { avgPct: number; peers: number } | null {
  const others = peers.filter((p) => p.code !== selfCode && Number.isFinite(p.changePct));
  if (others.length < 3) return null;
  return { avgPct: others.reduce((s, p) => s + p.changePct, 0) / others.length, peers: others.length };
}

// ---------------------------------------------------------------- 분기 실적·현금흐름

// DART 단일회사 전체 재무제표(fnlttSinglAcntAll.json) 한 행 — 쓰는 필드만.
// 분기·반기 보고서에서 손익계산서의 thstrm_amount는 "그 분기 3개월", thstrm_add_amount는
// "연초부터 누적", frmtrm_q_amount/frmtrm_add_amount는 전년 같은 기간. 현금흐름표는
// 원래 누적이라 thstrm_amount가 누적이고 전년 같은 기간은 frmtrm_q_amount(분기·반기)
// 또는 frmtrm_amount(사업보고서)에 온다 — 2026-10-27 실제 응답(아티스트스튜디오·
// 삼천당제약 반기보고서)으로 확인.
export type DartFsRow = {
  sj_div: string;
  account_id: string;
  account_nm: string;
  thstrm_amount?: string;
  thstrm_add_amount?: string;
  frmtrm_amount?: string;
  frmtrm_q_amount?: string;
  frmtrm_add_amount?: string;
};

export type ReportCode = "11013" | "11012" | "11014" | "11011"; // 1분기·반기·3분기·사업보고서
const REPORT_LABEL: Record<ReportCode, { report: string; quarter: string | null; cumulative: string }> = {
  "11013": { report: "1분기보고서", quarter: "1분기", cumulative: "1분기" },
  "11012": { report: "반기보고서", quarter: "2분기", cumulative: "상반기 누적" },
  "11014": { report: "3분기보고서", quarter: "3분기", cumulative: "1~3분기 누적" },
  "11011": { report: "사업보고서", quarter: null, cumulative: "연간" },
};

export type Amount = { current: number | null; priorYear: number | null };
export type QuarterlyFinancials = {
  year: number;
  reportCode: ReportCode;
  reportName: string; // "2026년 반기보고서"
  fsLabel: "연결" | "별도";
  quarterLabel: string | null; // "2분기" — 사업보고서면 null
  cumulativeLabel: string; // "상반기 누적" / "연간"
  quarter: { revenue: Amount; operatingIncome: Amount; netIncome: Amount } | null;
  cumulative: { revenue: Amount; operatingIncome: Amount; netIncome: Amount };
  operatingCashFlow: Amount; // 누적
  notes: string[]; // 규칙 해석
};

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// 손익은 IS(손익계산서)가 따로 있으면 그걸, 없으면 CIS(포괄손익계산서)에서.
function findRow(rows: DartFsRow[], ids: string[], names: RegExp, sj: string[]): DartFsRow | null {
  for (const s of sj) {
    const inSj = rows.filter((r) => r.sj_div === s);
    const byId = inSj.find((r) => ids.includes(r.account_id));
    if (byId) return byId;
    const byName = inSj.find((r) => names.test(r.account_nm.replace(/\s/g, "")));
    if (byName) return byName;
  }
  return null;
}

export function parseQuarterlyFinancials(rows: DartFsRow[], year: number, reportCode: ReportCode, fsLabel: "연결" | "별도"): QuarterlyFinancials | null {
  const IS = ["IS", "CIS"];
  const revenue = findRow(rows, ["ifrs-full_Revenue"], /^(매출액|수익\(매출액\)|영업수익|매출|수익)$/, IS);
  const op = findRow(rows, ["dart_OperatingIncomeLoss"], /^영업이익(\(손실\))?$/, IS);
  const net = findRow(rows, ["ifrs-full_ProfitLoss"], /^(당기|분기|반기)?순이익(\(손실\))?$/, IS);
  const ocf = findRow(rows, ["ifrs-full_CashFlowsFromUsedInOperatingActivities"], /^영업활동(으로인한)?현금흐름$/, ["CF"]);
  if (!revenue && !op && !net) return null;

  const annual = reportCode === "11011";
  const quarterAmt = (r: DartFsRow | null): Amount => ({ current: num(r?.thstrm_amount), priorYear: num(r?.frmtrm_q_amount) });
  const cumAmt = (r: DartFsRow | null): Amount =>
    annual
      ? { current: num(r?.thstrm_amount), priorYear: num(r?.frmtrm_amount) }
      : // 1분기는 분기 = 누적이라 add가 비어 있을 수 있다
        { current: num(r?.thstrm_add_amount) ?? num(r?.thstrm_amount), priorYear: num(r?.frmtrm_add_amount) ?? num(r?.frmtrm_q_amount) };
  const label = REPORT_LABEL[reportCode];
  const cumulative = { revenue: cumAmt(revenue), operatingIncome: cumAmt(op), netIncome: cumAmt(net) };
  const operatingCashFlow: Amount = { current: num(ocf?.thstrm_amount), priorYear: annual ? num(ocf?.frmtrm_amount) : num(ocf?.frmtrm_q_amount) ?? num(ocf?.frmtrm_amount) };

  // 해석은 부호 비교만(규칙) — "이익의 질" 같은 판단을 숫자 없이 하지 않는다
  const notes: string[] = [];
  const ni = cumulative.netIncome.current;
  const oi = cumulative.operatingIncome.current;
  const cf = operatingCashFlow.current;
  if (ni !== null && cf !== null && ni > 0 && cf < 0) notes.push("순이익은 흑자인데 영업활동현금흐름은 마이너스 — 이익이 현금으로 들어오고 있는지 확인이 필요해요");
  if (oi !== null && cf !== null && oi < 0 && cf < 0) notes.push("영업손실이면서 영업활동현금흐름도 마이너스 — 영업에서 현금이 빠져나가는 중이에요");
  if (oi !== null && cf !== null && oi < 0 && cf > 0) notes.push("영업손실이지만 영업활동현금흐름은 플러스예요(운전자본 변동 등 일시 요인일 수 있음)");
  const pOi = cumulative.operatingIncome.priorYear;
  if (oi !== null && pOi !== null && oi > 0 && pOi < 0) notes.push("전년 같은 기간 적자에서 영업이익 흑자로 돌아섰어요");
  if (oi !== null && pOi !== null && oi < 0 && pOi > 0) notes.push("전년 같은 기간 흑자에서 영업적자로 돌아섰어요");

  return {
    year,
    reportCode,
    reportName: `${year}년 ${label.report}`,
    fsLabel,
    quarterLabel: label.quarter,
    cumulativeLabel: label.cumulative,
    quarter: annual ? null : { revenue: quarterAmt(revenue), operatingIncome: quarterAmt(op), netIncome: quarterAmt(net) },
    cumulative,
    operatingCashFlow,
    notes,
  };
}

// 최신 보고서부터 찾을 순서 — 올해 3분기 → 반기 → 1분기 → 작년 사업보고서 → 작년 3분기.
// 아직 안 나온 보고서는 DART가 "013 조회된 데이터 없음"으로 답해서 다음 후보로 넘어간다.
export function reportCandidates(nowYear: number): { year: number; code: ReportCode }[] {
  return [
    { year: nowYear, code: "11014" },
    { year: nowYear, code: "11012" },
    { year: nowYear, code: "11013" },
    { year: nowYear - 1, code: "11011" },
    { year: nowYear - 1, code: "11014" },
  ];
}

// ---------------------------------------------------------------- 시나리오

export type Scenario = {
  name: "반등" | "횡보" | "추가 하락";
  condition: string;
  watch: string;
  response: string;
  invalidation: string;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

type NamedLevel = { label: string; price: number };

// 현재가 위·아래의 확인 가격들 — 전부 실제 차트에서 계산된 값만(지지/저항, 이평, 기간 저점).
function levelsAround(chart: ChartDetail): { above: NamedLevel[]; below: NamedLevel[] } {
  const all: NamedLevel[] = [];
  if (chart.resistance) all.push({ label: `저항 ${won(chart.resistance.price)}`, price: chart.resistance.price });
  if (chart.support) all.push({ label: `지지 ${won(chart.support.price)}`, price: chart.support.price });
  for (const m of chart.mas) if (m.period !== 5) all.push({ label: `${m.period}일선 ${won(m.value)}`, price: m.value });
  for (const r of chart.ranges) all.push({ label: `${r.label} 저점 ${won(r.low)}`, price: r.low });
  const above = all.filter((l) => l.price > chart.price).sort((a, b) => a.price - b.price);
  const below = all.filter((l) => l.price < chart.price).sort((a, b) => b.price - a.price);
  // 가격이 거의 같은(1% 이내) 레벨은 하나로
  const dedupe = (xs: NamedLevel[]) => xs.filter((l, i) => i === 0 || Math.abs(l.price - xs[i - 1].price) / xs[i - 1].price > 0.01);
  return { above: dedupe(above), below: dedupe(below) };
}

export function buildScenarios(chart: ChartDetail | null, volume: VolumeDetail | null): Scenario[] | null {
  if (!chart || (chart.mas.length === 0 && !chart.support && !chart.resistance)) return null;
  const { above, below } = levelsAround(chart);
  const up1 = above[0] ?? null;
  const up2 = above[1] ?? null;
  const down1 = below[0] ?? null;
  const down2 = below[1] ?? null;
  const volCond = volume?.avg20Volume ? ` + 거래량이 20일 평균(${Math.round(volume.avg20Volume).toLocaleString("ko-KR")}주) 이상` : "";
  const atrNote = chart.atr14 !== null ? ` (하루 평균 변동 폭 약 ${won(chart.atr14)})` : "";

  const scenarios: Scenario[] = [];
  scenarios.push(
    up1
      ? {
          name: "반등",
          condition: `${up1.label} 위로 종가 회복${volCond}`,
          watch: up2 ? `${up1.label} → 다음 ${up2.label}` : up1.label,
          response: "회복이 확인되면 보유를 이어갈 근거가 강해져요. 확인 전 추가매수는 서두르지 않는 게 기본값이에요",
          invalidation: `회복 후 다시 ${won(up1.price)} 아래로 마감`,
        }
      : {
          name: "반등",
          condition: "현재가 위에 계산된 저항·이평이 없어요(신고가 구간)",
          watch: `최근 고점과 5일선${atrNote}`,
          response: "추세가 이어지는지 거래량과 함께 확인해요",
          invalidation: "5일선 아래로 마감",
        }
  );
  if (up1 && down1) {
    scenarios.push({
      name: "횡보",
      condition: `${won(down1.price)} ~ ${won(up1.price)} 안에서 등락`,
      watch: `아래 ${down1.label} · 위 ${up1.label}${atrNote}`,
      response: "방향이 정해질 때까지 비중은 그대로 두고, 보유 이유가 아직 유효한지 점검해요",
      invalidation: "위나 아래로 범위를 벗어나 마감",
    });
  }
  scenarios.push(
    down1
      ? {
          name: "추가 하락",
          condition: `${down1.label} 아래로 종가 이탈`,
          watch: down2 ? `${down1.label} → 다음 ${down2.label}` : down1.label,
          response: "이탈하면 보유 이유가 아직 유효한지 다시 확인하고, 비중 축소 여부를 검토할 구간이에요",
          invalidation: `이탈 후 1~2거래일 안에 ${won(down1.price)} 위로 복귀`,
        }
      : {
          name: "추가 하락",
          condition: "현재가 아래에 계산된 지지·저점이 없어요(신저가 구간)",
          watch: `하루 변동 폭${atrNote}`,
          response: "바닥을 확인할 기준 가격이 없는 구간이라 보유 이유를 먼저 점검해요",
          invalidation: "거래량이 실린 반등으로 5일선 회복",
        }
  );
  return scenarios;
}
