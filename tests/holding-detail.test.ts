// 보유종목 상세 분석(B단계) — 사용자 스펙 3~5번(차트·거래량·수급) 계산 검증. 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChartDetail, computeFlowDetail, computeVolumeDetail } from "@/lib/holding-detail";
import type { ChartCandle } from "@/lib/kis-chart";
import type { InvestorTrendRow } from "@/lib/kis-investor-trend";

function day(i: number): string {
  const d = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function candlesFromCloses(closes: number[], volume: (i: number) => number = () => 1000): ChartCandle[] {
  return closes.map((c, i) => ({ date: day(i), open: c, high: c, low: c, close: c, volume: volume(i), tradingValue: c * volume(i) }));
}

test("이동평균 5·20·60·120일과 이격도·기울기·정배열", () => {
  const closes = Array.from({ length: 130 }, (_, i) => 1000 + i * 10); // 꾸준한 상승
  const d = computeChartDetail(candlesFromCloses(closes), closes[closes.length - 1])!;
  assert.deepEqual(d.mas.map((m) => m.period), [5, 20, 60, 120]);
  const ma20 = d.mas.find((m) => m.period === 20)!;
  assert.equal(ma20.value, closes.slice(-20).reduce((a, b) => a + b, 0) / 20);
  assert.ok(Math.abs(ma20.gapPct - (closes[129] / ma20.value - 1) * 100) < 1e-9);
  assert.equal(ma20.trend, "상승");
  assert.equal(d.alignment, "정배열");
  assert.deepEqual(d.missingMas, []);
});

test("상장 기간이 짧으면 계산 못 한 이평은 비워두고 배열 판정도 하지 않는다", () => {
  const d = computeChartDetail(candlesFromCloses(Array.from({ length: 30 }, () => 1000)), 1000)!;
  assert.deepEqual(d.missingMas, [60, 120]);
  assert.equal(d.alignment, null);
  assert.equal(d.mas.find((m) => m.period === 20)!.trend, "횡보");
});

test("이격도: 현재가 110원, 20일선 100원이면 +10%", () => {
  const d = computeChartDetail(candlesFromCloses(Array.from({ length: 25 }, () => 100)), 110)!;
  const ma20 = d.mas.find((m) => m.period === 20)!;
  assert.equal(ma20.value, 100);
  assert.ok(Math.abs(ma20.gapPct - 10) < 1e-9);
});

test("기간별 고점·저점과 날짜", () => {
  const closes = Array.from({ length: 60 }, () => 1000);
  closes[10] = 1500; // 60일 고점(20일 구간 밖)
  closes[50] = 800; // 20일 안 저점
  const d = computeChartDetail(candlesFromCloses(closes), 1000)!;
  const r20 = d.ranges.find((r) => r.label === "20일")!;
  const r60 = d.ranges.find((r) => r.label === "60일")!;
  assert.equal(r20.high, 1000);
  assert.equal(r20.low, 800);
  assert.equal(r20.lowDate, day(50));
  assert.equal(r60.high, 1500);
  assert.equal(r60.highDate, day(10));
  assert.ok(Math.abs(r60.fromHighPct - (-33.333)) < 0.01);
});

test("볼린저: 계속 오르면 상단 밴드워크, %B·밴드폭이 나온다", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 1000 + i * 10);
  const b = computeChartDetail(candlesFromCloses(closes), closes[39])!.bollinger!;
  assert.ok(b.percentB! > 0.8);
  assert.equal(b.walk, "상단 밴드워크");
  assert.ok(b.walkDays >= 3);
  assert.ok(b.bandWidthPct > 0);
});

test("RSI·ATR은 데이터가 부족하면 지어내지 않는다", () => {
  const d = computeChartDetail(candlesFromCloses([1000, 1010, 1020]), 1020)!;
  assert.equal(d.rsi14, null);
  assert.equal(d.atr14, null);
  assert.equal(d.bollinger, null);
});

test("장중엔 오늘 누적 거래량을 20일 평균과 '증감률'로 비교하지 않고 진행률만 보여준다", () => {
  const candles = candlesFromCloses(Array.from({ length: 26 }, () => 1000), (i) => (i === 25 ? 300 : 1000));
  const quote = { price: 1000, changePct: 0, prevClose: 1000, tradingHalted: false, statusLabel: null, fetchedAt: "", volume: 320, tradingValue: 320_000, marketCap: 0, sharesOutstanding: 0 };
  const v = computeVolumeDetail(candles, { lastCandlePartial: true, quote, minutesSinceOpen: 78 })!;
  assert.equal(v.partial, true);
  assert.equal(v.latestVolume, 320); // 시세 API 누적값이 더 최신
  assert.equal(v.avg20Volume, 1000);
  assert.equal(v.vsAvg20Pct, null);
  assert.equal(v.progressPct, 32);
  assert.equal(v.sessionElapsedPct, 20); // 78 / 390
});

test("장 마감 후엔 오늘 거래량을 직전 20거래일 평균과 비교한다(오늘은 평균에서 제외)", () => {
  const candles = candlesFromCloses(Array.from({ length: 26 }, () => 1000), (i) => (i === 25 ? 2500 : 1000));
  const v = computeVolumeDetail(candles, { lastCandlePartial: false, quote: null, minutesSinceOpen: null })!;
  assert.equal(v.avg20Volume, 1000);
  assert.equal(v.vsAvg20Pct, 150);
  assert.equal(v.avg5TradingValue, 1_000_000);
  assert.equal(v.progressPct, null);
});

test("상승일·하락일 평균 거래량", () => {
  const closes = [100, 110, 100, 110, 100, 110];
  const vols = [0, 500, 100, 500, 100, 500];
  const v = computeVolumeDetail(candlesFromCloses(closes, (i) => vols[i]), { lastCandlePartial: false, quote: null, minutesSinceOpen: null })!;
  assert.equal(v.upDays, 3);
  assert.equal(v.downDays, 2);
  assert.equal(v.upDayAvgVolume, 500);
  assert.equal(v.downDayAvgVolume, 100);
});

function flowRow(i: number, foreignQty: number, institutionQty: number): InvestorTrendRow {
  return { date: day(100 - i), individual: 0, foreign: foreignQty * 1000, institution: institutionQty * 1000, individualQty: -(foreignQty + institutionQty), foreignQty, institutionQty };
}

test("수급: 최신일·5일·20일 누적, 연속 순매수/순매도 일수, 거래량 대비 비율", () => {
  // 최신순: 외국인 3일 연속 순매도 후 순매수
  const rows = Array.from({ length: 25 }, (_, i) => flowRow(i, i < 3 ? -100 : 50, 10));
  const candles = Array.from({ length: 30 }, (_, k) => ({ date: day(100 - k), open: 1, high: 1, low: 1, close: 1, volume: 1000 })).reverse();
  const f = computeFlowDetail(rows, candles);
  const foreign = f.investors.find((x) => x.key === "foreign")!;
  assert.equal(f.asOfDate, day(100));
  assert.deepEqual(foreign.streak, { direction: "순매도", days: 3 });
  assert.equal(foreign.sum5!.qty, -100 * 3 + 50 * 2);
  assert.equal(foreign.sum5!.pctOfVolume, (-200 / 5000) * 100);
  assert.equal(foreign.sum20!.qty, -300 + 50 * 17);
  const inst = f.investors.find((x) => x.key === "institution")!;
  assert.deepEqual(inst.streak, { direction: "순매수", days: 25 });
});

test("수급 데이터가 20일보다 적으면 20일 누적은 비워둔다", () => {
  const f = computeFlowDetail([flowRow(0, 1, 1), flowRow(1, 1, 1)], []);
  assert.equal(f.investors[0].sum20, null);
  assert.equal(f.investors[0].sum5, null);
  assert.equal(f.investors[0].latest!.qty, 1);
});
