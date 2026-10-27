// 보유종목 텔레그램 알림 — 사용자 스펙(2026-10-27) 14번 "테스트 및 완료 기준" 중
// 순수 계산으로 확인 가능한 항목들. 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyChange, buildPriceSnapshot } from "@/lib/holding-price";
import { decideAlert, deepLossLine, formatPriceLine, formatStockAlert } from "@/lib/holding-alert-format";
import { assessHolding, computeTechMetrics, stateFromSignals, type Candle } from "@/lib/holding-assessment";
import { marketSession } from "@/lib/dates";
import { splitForTelegram } from "@/lib/telegram-send";
import type { KisQuote } from "@/lib/kis-quote";

function quote(over: Partial<KisQuote> = {}): KisQuote {
  return {
    price: 10_500,
    changePct: 5,
    prevClose: 10_000,
    tradingHalted: false,
    statusLabel: null,
    fetchedAt: "2026-10-27T01:00:00.000Z",
    volume: 0,
    tradingValue: 0,
    marketCap: 0,
    sharesOutstanding: 0,
    ...over,
  };
}

function flatCandles(n: number, close = 10_000, volume = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => ({ date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`, high: close, low: close, close, volume }));
}

test("전일 종가 10,000원 → 현재가 10,500원이면 오늘 +500원, +5.00%", () => {
  const { amount, pct } = dailyChange(10_500, 10_000);
  assert.equal(amount, 500);
  assert.equal(pct!.toFixed(2), "5.00");
});

test("오늘 등락률과 매수가 대비 손익률이 섞이지 않는다", () => {
  const a = assessHolding({
    name: "테스트", code: "000001", avgBuyPrice: 17_500, quantity: 10, currentPrice: 10_500,
    candles: flatCandles(30), flows: [], financials: [], portfolioValuation: 105_000,
  });
  const line = formatPriceLine(a, buildPriceSnapshot(quote(), [], "장중")!);
  assert.match(line, /현재가 10,500원/);
  assert.match(line, /오늘 \+500원\(\+5\.00%\)/);
  assert.match(line, /내 손익 -40\.0%\(-70,000원\)/);
});

test("시세 기준 시각은 KIS 조회 시각, 장중엔 '현재가'·장 마감 후엔 '종가'", () => {
  const live = buildPriceSnapshot(quote(), [], "장중")!;
  assert.equal(live.asOf, "2026-10-27T01:00:00.000Z");
  assert.equal(live.priceLabel, "현재가");
  assert.equal(buildPriceSnapshot(quote(), [], "장 마감")!.priceLabel, "종가");
});

test("실시간 시세 조회에 실패하면 실시간 가격처럼 표시하지 않는다", () => {
  const snap = buildPriceSnapshot(null, [{ date: "2026-10-26", close: 9_800 }, { date: "2026-10-27", close: 10_000 }], "장중")!;
  assert.equal(snap.live, false);
  const a = assessHolding({ name: "테스트", code: "000001", avgBuyPrice: 10_000, quantity: 1, currentPrice: 10_000, candles: flatCandles(30), flows: [], financials: [], portfolioValuation: 10_000 });
  const line = formatPriceLine(a, snap);
  assert.match(line, /실시간 시세 조회 실패/);
  assert.doesNotMatch(line, /현재가/);
});

test("전일 종가가 없으면 원 단위 변화를 지어내지 않는다", () => {
  const snap = buildPriceSnapshot(quote({ prevClose: null, changePct: 3.2 }), [], "장중")!;
  assert.equal(snap.changeAmount, null);
  assert.equal(snap.changePct, 3.2);
  assert.equal(buildPriceSnapshot(null, [{ date: "2026-10-27", close: 10_000 }], "장중")!.changePct, null);
});

test("장중엔 덜 찬 오늘 일봉 거래량을 20일 평균과 비교하지 않는다", () => {
  const candles = flatCandles(26);
  candles[candles.length - 1] = { ...candles[candles.length - 1], volume: 10 }; // 오전 10시, 하루치의 일부
  assert.ok(computeTechMetrics(candles).volumeRatio! < 0.9); // 예전 방식: 거래 위축으로 오판
  const fixed = computeTechMetrics(candles, { lastCandlePartial: true });
  assert.equal(fixed.volumeRatio, 1);
  assert.equal(fixed.volumeExcludesToday, true);

  const a = assessHolding({ name: "t", code: "1", avgBuyPrice: 10_000, quantity: 1, currentPrice: 10_000, candles, flows: [], financials: [], portfolioValuation: 10_000, lastCandlePartial: true });
  const volume = a.signals.find((s) => s.key === "volume")!;
  assert.match(volume.note, /직전 20거래일 평균 대비/);
  assert.match(volume.note, /장중이라 오늘 제외/);
});

test("같은 등급이 유지되면 다시 알리지 않는다(매일 반복되던 버그)", () => {
  // 그제 관찰 → 어제 축소검토(이때 알림) → 오늘도 축소검토
  assert.equal(decideAlert({ state: "축소검토", previousState: "축소검토", alreadyAlertedState: null }), null);
  assert.equal(decideAlert({ state: "축소검토", previousState: "관찰", alreadyAlertedState: null }), "worsened");
});

test("장중에 오르내려도 오늘 이미 알린 등급보다 나빠질 때만 다시 보낸다", () => {
  assert.equal(decideAlert({ state: "축소검토", previousState: "관찰", alreadyAlertedState: "축소검토" }), null);
  assert.equal(decideAlert({ state: "축소검토", previousState: "관찰", alreadyAlertedState: "정밀점검" }), null);
  assert.equal(decideAlert({ state: "정밀점검", previousState: "관찰", alreadyAlertedState: "축소검토" }), "worsened");
});

test("처음 진단된 종목은 축소검토 이상일 때만 알린다", () => {
  assert.equal(decideAlert({ state: "축소검토", previousState: null, alreadyAlertedState: null }), "new-risky");
  assert.equal(decideAlert({ state: "관찰", previousState: null, alreadyAlertedState: null }), null);
});

test("종목 알림은 등급 변화·가격·원인 3줄이고 원인은 최대 3개", () => {
  const a = assessHolding({
    name: "아티스트스튜디오", code: "123456", avgBuyPrice: 20_000, quantity: 5, currentPrice: 10_500,
    candles: flatCandles(30), flows: [{ foreign: -1, institution: -1 }], financials: [], portfolioValuation: 52_500,
  });
  const text = formatStockAlert({
    kind: "worsened", assessment: a, price: buildPriceSnapshot(quote(), [], "장중")!, previousState: "관찰",
    changedReasons: ["수급: a", "차트: b", "거래량: c", "재무: d"],
  });
  const lines = text.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /🟡관찰 → \*\*/);
  assert.equal(lines[2].split(" / ").length, 3);
});

test("손익률이 마이너스라는 이유만으로 등급을 올리지 않는다(-50% 규칙 삭제)", () => {
  const base = { name: "t", code: "1", quantity: 10, currentPrice: 10_000, candles: flatCandles(30), flows: [{ foreign: -1, institution: 1 }], financials: [], portfolioValuation: 100_000 };
  const deepLoss = assessHolding({ ...base, avgBuyPrice: 30_000 }); // -66.7%
  const profit = assessHolding({ ...base, avgBuyPrice: 8_000 }); // +25%
  assert.equal(deepLoss.state, profit.state);
  assert.equal(deepLoss.stateNote, profit.stateNote);
});

test("깊은 손실은 등급 대신 별도 경고 줄로 보여준다", () => {
  const base = { name: "t", code: "1", quantity: 10, currentPrice: 10_000, candles: flatCandles(30), flows: [], financials: [], portfolioValuation: 100_000 };
  const deep = assessHolding({ ...base, avgBuyPrice: 40_000 }); // -75%
  assert.match(deepLossLine(deep)!, /손실 -75\.0% — 원금 회복까지 \+300\.0% 필요\(등급과 별개\)/);
  assert.equal(deepLossLine(assessHolding({ ...base, avgBuyPrice: 16_000 })), null); // -37.5%
  const text = formatStockAlert({ kind: "worsened", assessment: deep, price: buildPriceSnapshot(quote(), [], "장중")!, previousState: "관찰", changedReasons: ["차트: x"] });
  assert.equal(text.split("\n").length, 4);
});

test("과거 기록 등급은 저장된 신호 점수로 지금 규칙에 맞춰 다시 매긴다", () => {
  // 예전 규칙으로 '정밀점검'(축소검토 + 손실 가중)이 저장된 날의 신호 — 지금 규칙으론 축소검토
  assert.equal(stateFromSignals([{ score: -2 }, { score: -1 }, { score: 0 }, { score: 1 }]).state, "축소검토");
  assert.equal(stateFromSignals([{ score: -2 }, { score: null }]).state, "관찰"); // 신호 2개 미만
});

test("시장 상태: 장전/장중/장 마감/휴장", () => {
  assert.equal(marketSession(new Date("2026-10-27T01:00:00Z")), "장중"); // 화 10:00 KST
  assert.equal(marketSession(new Date("2026-10-26T23:30:00Z")), "장전"); // 화 08:30 KST
  assert.equal(marketSession(new Date("2026-10-27T07:00:00Z")), "장 마감"); // 화 16:00 KST
  assert.equal(marketSession(new Date("2026-10-31T01:00:00Z")), "휴장"); // 토요일
});

test("긴 메시지는 줄 단위로 안전하게 나눠 보낸다", () => {
  const text = Array.from({ length: 200 }, (_, i) => `**종목${i}** 현재가 10,000원 · 오늘 +1.00% · 내 손익 -3.0%`).join("\n");
  const chunks = splitForTelegram(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 3500));
  assert.equal(chunks.join("\n"), text);
});
