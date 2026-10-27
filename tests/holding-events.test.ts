// 보유종목 알림 E단계 — 사건 감지·중복 방지·해소·등급 히스테리시스, 분기 실적 파싱.
// 사용자 스펙(2026-10-27) 6·10·14번 중 순수 계산으로 확인 가능한 것. 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideGradeDelivery,
  detectHoldingEvents,
  parseThesisConditions,
  planEventDelivery,
  type DetectInput,
  type HoldingEvent,
} from "@/lib/holding-events";
import { assessHolding, type Candle } from "@/lib/holding-assessment";
import type { PriceSnapshot } from "@/lib/holding-price";
import type { HoldingDetail } from "@/lib/holding-detail";
import { parseQuarterlyFinancials, type DartFsRow } from "@/lib/holding-context";
import { formatAlertMessage } from "@/lib/holding-alert-format";

const candles: Candle[] = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`, high: 10_000, low: 10_000, close: 10_000, volume: 100 }));

function input(over: { price?: Partial<PriceSnapshot> | null; detail?: Partial<HoldingDetail>; weight?: number; avg?: number; filings?: DetectInput["filings"]; thesis?: string | null } = {}): DetectInput {
  const assessment = assessHolding({ name: "텔레칩스", code: "054450", avgBuyPrice: over.avg ?? 10_000, quantity: 10, currentPrice: 10_000, candles, flows: [], financials: [], portfolioValuation: over.weight ? (100_000 * 100) / over.weight : 1_000_000 });
  const price: PriceSnapshot | null =
    over.price === null
      ? null
      : { price: 10_000, priceLabel: "현재가", prevClose: 10_200, changeAmount: -200, changePct: -1.96, asOf: "2026-10-27T02:00:00Z", session: "장중", live: true, source: "KIS", tradingHalted: false, statusLabel: null, ...over.price };
  return {
    date: "2026-10-27",
    assessment,
    price,
    detail: { chart: null, volume: null, flow: { asOfDate: null, days: 0, investors: [], joint: null }, financials: [], ...over.detail } as HoldingDetail,
    filings: over.filings ?? [],
    thesisInvalidation: over.thesis ?? null,
  };
}

const keys = (events: HoldingEvent[]) => events.map((e) => e.key);

test("거래정지·관리종목은 긴급, 투자주의는 주의", () => {
  const halted = detectHoldingEvents(input({ price: { tradingHalted: true } }));
  assert.equal(halted.events[0].severity, "긴급");
  assert.equal(halted.events[0].key, "halt:054450");
  assert.equal(detectHoldingEvents(input({ price: { statusLabel: "관리종목" } })).events[0].severity, "긴급");
  assert.equal(detectHoldingEvents(input({ price: { statusLabel: "투자주의" } })).events[0].severity, "주의");
});

test("공시 사건은 공시번호로 한 번만(분류 심각도 그대로)", () => {
  const r = detectHoldingEvents(input({ filings: [{ rceptNo: "20261027000123", reportName: "감사보고서제출(의견거절)", reportDate: "20261027", category: "감사의견", severity: "긴급" }] }));
  assert.deepEqual(keys(r.events), ["filing:20261027000123"]);
  assert.equal(r.events[0].severity, "긴급");
});

test("직전 20거래일 최저가 이탈은 하루 한 번, 장중이면 '종가 확정 전'이라고 밝힌다", () => {
  const r = detectHoldingEvents(input({ detail: { chart: { prior20Low: { price: 10_500, date: "2026-10-10" }, asOfDate: "2026-10-27", bollinger: null } as never } }));
  assert.deepEqual(keys(r.events), ["low20-break:054450:2026-10-27"]);
  assert.match(r.events[0].title, /장중 기준\(종가 확정 전\)/);
});

test("거래량 급증: 장중엔 누적이 이미 하루 평균의 2배일 때만, 하락 중이면 주의", () => {
  const vol = (progressPct: number) => ({ volume: { partial: true, progressPct, latestDate: "2026-10-27", vsAvg20Pct: null } as never });
  assert.equal(detectHoldingEvents(input({ detail: vol(150) })).events.length, 0);
  const spike = detectHoldingEvents(input({ detail: vol(230) }));
  assert.equal(spike.events[0].severity, "주의");
  assert.match(spike.events[0].title, /20일 평균 하루치의 230%/);
});

test("외국인·기관 동반 순매도 3거래일 이상 — 연속이 이어지는 동안은 같은 키(매일 다시 안 보냄)", () => {
  const joint = (days: number) => ({ flow: { asOfDate: "2026-10-26", days: 30, investors: [], joint: { direction: "동반 순매도" as const, days, startDate: "2026-10-22", endDate: "2026-10-26" } } });
  assert.equal(detectHoldingEvents(input({ detail: joint(2) })).events.length, 0);
  const a = detectHoldingEvents(input({ detail: joint(3) })).events[0];
  const b = detectHoldingEvents(input({ detail: joint(4) })).events[0];
  assert.equal(a.key, b.key);
  assert.equal(a.severity, "주의");
});

test("비중 30% 이상은 한 번, 25% 아래로 내려가야 해소(경계 반복 알림 방지)", () => {
  assert.deepEqual(keys(detectHoldingEvents(input({ weight: 52 })).events), ["weight-high:054450"]);
  const between = detectHoldingEvents(input({ weight: 27 }));
  assert.equal(between.events.length, 0);
  assert.ok(!between.clearPrefixes.includes("weight-high:054450"));
  assert.ok(detectHoldingEvents(input({ weight: 20 })).clearPrefixes.includes("weight-high:054450"));
});

test("기록한 무효화 조건에서 가격·손실률만 뽑아 비교하고, 못 뽑으면 지어내지 않는다", () => {
  assert.deepEqual(parseThesisConditions("8,000원 깨지면 정리"), { priceBelow: 8000, lossPct: null });
  assert.deepEqual(parseThesisConditions("-30% 손실이면 손절"), { priceBelow: null, lossPct: 30 });
  assert.deepEqual(parseThesisConditions("실적이 꺾이면 판다"), { priceBelow: null, lossPct: null });
  const hit = detectHoldingEvents(input({ thesis: "10,500원 아래로 가면 정리" }));
  assert.equal(hit.events[0].type, "thesis-price");
  const loss = detectHoldingEvents(input({ avg: 20_000, thesis: "40% 이상 손실이면 손절" }));
  assert.equal(loss.events[0].type, "thesis-loss");
});

test("시세를 못 받으면 거래정지·종목 상태를 해소로 처리하지 않는다", () => {
  const prefixes = detectHoldingEvents(input({ price: null })).clearPrefixes;
  assert.ok(!prefixes.some((p) => p.startsWith("halt:") || p.startsWith("market-warning:")));
});

const ev = (key: string, severity: HoldingEvent["severity"] = "주의", persistent = true): HoldingEvent => ({ type: "weight-high", code: "054450", name: "텔레칩스", key, severity, title: key, persistent });
const sentAt = new Date("2026-10-27T01:00:00Z");

test("같은 사건은 해소되기 전까지 다시 보내지 않고, 심각도가 오르면 다시 보낸다", () => {
  const logs = [{ eventKey: "a", severity: "주의", sentAt, resolvedAt: null }];
  assert.equal(planEventDelivery({ events: [ev("a")], clearPrefixes: [], logs, seedOnly: false }).send.length, 0);
  assert.equal(planEventDelivery({ events: [ev("a", "긴급")], clearPrefixes: [], logs, seedOnly: false }).send.length, 1);
});

test("해소됐다가 다시 생기면 다시 보내고, 보내기에 실패했던 사건은 재시도한다", () => {
  assert.equal(planEventDelivery({ events: [ev("a")], clearPrefixes: [], logs: [{ eventKey: "a", severity: "주의", sentAt, resolvedAt: new Date() }], seedOnly: false }).send.length, 1);
  assert.equal(planEventDelivery({ events: [ev("a")], clearPrefixes: [], logs: [{ eventKey: "a", severity: "주의", sentAt: null, resolvedAt: null }], seedOnly: false }).send.length, 1);
});

test("확인된 조건이 풀린 상태형 사건만 해소 처리한다", () => {
  const logs = [
    { eventKey: "weight-high:054450", severity: "주의", sentAt, resolvedAt: null },
    { eventKey: "halt:000250", severity: "긴급", sentAt, resolvedAt: null },
  ];
  const r = planEventDelivery({ events: [], clearPrefixes: ["weight-high:054450"], logs, seedOnly: false });
  assert.deepEqual(r.resolveKeys, ["weight-high:054450"]);
});

test("첫 실행엔 원래부터 이어지던 주의 상태는 조용히 기록만, 긴급은 그래도 보낸다", () => {
  const r = planEventDelivery({ events: [ev("weight-high:x"), ev("halt:x", "긴급"), ev("low20:x:d", "주의", false)], clearPrefixes: [], logs: [], seedOnly: true });
  assert.deepEqual(r.seed.map((e) => e.key), ["weight-high:x"]);
  assert.deepEqual(r.send.map((e) => e.key), ["halt:x", "low20:x:d"]); // 긴급 먼저
});

const at = (hhmm: string) => new Date(`2026-10-27T${hhmm}:00+09:00`);

test("등급 악화를 처음 본 정시엔 보류하고, 다음 정시에도 그대로면 보낸다", () => {
  const base = { state: "축소검토" as const, previousState: "관찰" as const, lastRunOfDay: false, hasUrgentEvent: false };
  assert.deepEqual(decideGradeDelivery({ ...base, pending: null, now: at("10:00") }), { action: "hold", resetPending: true });
  assert.equal(decideGradeDelivery({ ...base, pending: { firstSeenAt: at("10:00"), lastSeenAt: at("10:00") }, now: at("11:00") }).action, "send");
});

test("중간에 좋아졌다가 다시 나빠지면 처음부터 다시 잰다(연속이 끊김)", () => {
  const base = { state: "축소검토" as const, previousState: "관찰" as const, lastRunOfDay: false, hasUrgentEvent: false };
  // 10시 악화 → 11시 회복(기록 갱신 없음) → 12시 다시 악화
  assert.deepEqual(decideGradeDelivery({ ...base, pending: { firstSeenAt: at("10:00"), lastSeenAt: at("10:00") }, now: at("12:00") }), { action: "hold", resetPending: true });
});

test("2단계 이상 악화·같은 종목 긴급 사건·그날 마지막 정시엔 지연 없이 보낸다", () => {
  const base = { previousState: "관찰" as const, pending: null, now: at("10:00") };
  assert.equal(decideGradeDelivery({ ...base, state: "정밀점검", lastRunOfDay: false, hasUrgentEvent: false }).action, "send");
  assert.equal(decideGradeDelivery({ ...base, state: "축소검토", lastRunOfDay: false, hasUrgentEvent: true }).action, "send");
  assert.equal(decideGradeDelivery({ ...base, state: "축소검토", lastRunOfDay: true, hasUrgentEvent: false }).action, "send");
});

test("요약 알림: 긴급 사건이 맨 위, 주의·참고는 따로 묶인다", () => {
  const text = formatAlertMessage({
    asOf: "2026-10-27 11:00",
    session: "장중",
    analyzedCount: 7,
    stockBlocks: [],
    improved: [],
    events: [
      { name: "텔레칩스", code: "054450", severity: "긴급", title: "⛔ 거래정지 상태예요" },
      { name: "DYP", code: "092780", severity: "주의", title: "직전 20거래일 최저가 이탈" },
      { name: "SK이노베이션", code: "096770", severity: "참고", title: "외국인·기관 동반 순매수 3거래일째" },
    ],
  });
  const lines = text.split("\n");
  assert.match(lines[0], /^🚨 둥지 알림/);
  assert.match(lines[1], /이벤트 3\(긴급 1\)/);
  assert.equal(lines[2], "우선 확인: **텔레칩스**");
  assert.ok(text.indexOf("🚨 긴급") < text.indexOf("📌 확인할 변화"));
  assert.ok(text.indexOf("📌 확인할 변화") < text.indexOf("ℹ️ 참고"));
});

// 2026-10-27 실제 DART 응답(아티스트스튜디오 2026 반기보고서, 연결)에서 쓰는 행만
const halfRows: DartFsRow[] = [
  { sj_div: "CIS", account_id: "ifrs-full_Revenue", account_nm: "매출액", thstrm_amount: "10039700126", thstrm_add_amount: "11294796290", frmtrm_q_amount: "3555918554", frmtrm_add_amount: "5737848604" },
  { sj_div: "CIS", account_id: "dart_OperatingIncomeLoss", account_nm: "영업이익(손실)", thstrm_amount: "-376251964", thstrm_add_amount: "-801234863", frmtrm_q_amount: "-1181305699", frmtrm_add_amount: "-1869488961" },
  { sj_div: "CIS", account_id: "ifrs-full_ProfitLoss", account_nm: "당기순이익(손실)", thstrm_amount: "-681934897", thstrm_add_amount: "-867536601", frmtrm_q_amount: "-896779496", frmtrm_add_amount: "-1237129585" },
  { sj_div: "CF", account_id: "ifrs-full_CashFlowsFromUsedInOperatingActivities", account_nm: "영업활동으로 인한 현금흐름", thstrm_amount: "5399629776", frmtrm_q_amount: "-4254239018" },
  { sj_div: "SCE", account_id: "ifrs-full_ProfitLoss", account_nm: "당기순이익(손실)", thstrm_amount: "0" },
];

test("분기 실적: 반기보고서는 2분기 3개월·상반기 누적·영업현금흐름(누적)을 나눠 읽는다", () => {
  const q = parseQuarterlyFinancials(halfRows, 2026, "11012", "연결")!;
  assert.equal(q.reportName, "2026년 반기보고서");
  assert.equal(q.quarterLabel, "2분기");
  assert.equal(q.quarter!.revenue.current, 10_039_700_126);
  assert.equal(q.quarter!.revenue.priorYear, 3_555_918_554);
  assert.equal(q.cumulative.operatingIncome.current, -801_234_863);
  assert.equal(q.cumulative.netIncome.current, -867_536_601); // SCE의 0이 아니라 손익계산서 값
  assert.equal(q.operatingCashFlow.current, 5_399_629_776);
  assert.equal(q.operatingCashFlow.priorYear, -4_254_239_018);
  assert.ok(q.notes.some((n) => /영업손실이지만 영업활동현금흐름은 플러스/.test(n)));
});

test("분기 실적: 손익 항목을 하나도 못 찾으면 지어내지 않고 null", () => {
  assert.equal(parseQuarterlyFinancials([{ sj_div: "BS", account_id: "ifrs-full_Assets", account_nm: "자산총계", thstrm_amount: "1" }], 2026, "11012", "연결"), null);
});
