// 보유종목 알림 C·D단계 — 공시 분류·뉴스 필터·원인 분리·시나리오·버튼·상세 화면.
// 사용자 스펙(2026-10-27) 6~9·11·14번 중 순수 계산으로 확인 가능한 것. 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScenarios, classifyFiling, decomposeMove, importantFilings, recentRelevantNews, sectorAverage } from "@/lib/holding-context";
import { computeChartDetail, computeVolumeDetail } from "@/lib/holding-detail";
import {
  detailKeyboard,
  kstLabel,
  parseAlertCallback,
  renderSection,
  serializePayload,
  summaryKeyboard,
  type AlertRecordPayload,
  type AlertRecordRow,
} from "@/lib/holding-alert-detail";
import type { ChartCandle } from "@/lib/kis-chart";

const filing = (reportName: string, reportDate = "20261020") => ({ rceptNo: "20261020000001", reportName, reportDate });

test("공시 분류: 거래정지·감사의견은 긴급, CB·유상증자는 주의, 실적은 참고, 정기보고서는 제외", () => {
  assert.equal(classifyFiling(filing("주권매매거래정지(상장적격성 실질심사 사유 발생)"))!.severity, "긴급");
  assert.equal(classifyFiling(filing("감사보고서제출(감사의견거절)"))!.category, "감사의견");
  assert.equal(classifyFiling(filing("주요사항보고서(전환사채권발행결정)"))!.severity, "주의");
  assert.equal(classifyFiling(filing("연결재무제표기준영업(잠정)실적(공정공시)"))!.severity, "참고");
  assert.equal(classifyFiling(filing("분기보고서 (2026.09)")), null);
});

test("중요 공시는 긴급 → 주의 → 참고 순, 같은 등급이면 최신 먼저", () => {
  const list = importantFilings([
    filing("단일판매ㆍ공급계약체결", "20261025"),
    filing("유상증자결정", "20261001"),
    filing("관리종목지정", "20261010"),
    filing("전환사채권발행결정", "20261015"),
  ]);
  assert.deepEqual(list.map((f) => f.category), ["관리종목", "주식 희석(CB·BW·유상증자)", "주식 희석(CB·BW·유상증자)", "계약·수주"]);
  assert.equal(list[1].reportDate, "20261015");
});

test("뉴스: 7일 지난 기사·종목명 없는 기사는 빼고, 제목에 종목명이 있는 기사를 먼저", () => {
  const now = Date.parse("2026-10-27T03:00:00Z");
  const item = (title: string, description: string, daysAgo: number) => ({ title, description, link: "https://x", source: "x", pubDate: new Date(now - daysAgo * 86_400_000).toISOString() });
  const out = recentRelevantNews("텔레칩스", [
    item("코스피 4% 급등", "삼성전자·텔레칩스 등 강세", 0.1),
    item("텔레칩스, 신규 수주", "차량용 반도체", 1),
    item("텔레칩스 지난달 기사", "", 9),
    item("다른 회사 소식", "무관", 0.2),
    item("텔레칩스, 신규 수주", "중복 기사", 1.5),
  ], now);
  assert.deepEqual(out.map((n) => n.title), ["텔레칩스, 신규 수주", "코스피 4% 급등"]);
});

test("원인 분리: 시장은 보합인데 종목만 크게 빠지면 종목 고유 요인 가능성", () => {
  const d = decomposeMove({ stockPct: -5, market: { name: "코스닥", pct: -0.5 }, sector: null });
  assert.equal(d.vsMarketPp, -4.5);
  assert.match(d.verdict, /시장보다 약해요 — 종목 자체 요인일 가능성/);
});

test("원인 분리: 시장과 같이 빠지면 전체 하락 흐름 영향, 업종 분류가 없으면 '업종'이라 말하지 않는다", () => {
  const d = decomposeMove({ stockPct: -3, market: { name: "코스피", pct: -2.6 }, sector: null });
  assert.equal(d.verdict, "시장과 비슷하게 움직였어요 — 개별 악재보다는 전체 하락 흐름의 영향으로 보여요");
  const up = decomposeMove({ stockPct: 1.4, market: { name: "코스닥", pct: 3.2 }, sector: null });
  assert.doesNotMatch(up.verdict, /악재|업종/);
});

test("원인 분리: 업종 평균은 같은 집계 시점의 종목 등락과 비교한다", () => {
  const d = decomposeMove({ stockPct: 4, market: { name: "코스닥", pct: 3.5 }, sector: { name: "바이오", avgPct: 2, peers: 40, asOf: "2026-10-27T00:49:00Z", selfPct: 1.5 } });
  assert.equal(d.vsSectorPp, -0.5); // 지금 시세(4%)가 아니라 그때 종목 등락(1.5%)으로
});

test("데이터가 없으면 원인을 지어내지 않는다", () => {
  assert.match(decomposeMove({ stockPct: null, market: null, sector: null }).verdict, /나눌 수 없어요/);
  assert.match(decomposeMove({ stockPct: -2, market: null, sector: null }).verdict, /나눌 수 없어요/);
  assert.equal(sectorAverage([{ code: "1", changePct: 1 }, { code: "2", changePct: 2 }, { code: "self", changePct: 9 }], "self"), null);
});

function candles(): ChartCandle[] {
  // 상승 후 조정: 0~89일 1000→1890, 90~129일 1890→1500
  return Array.from({ length: 130 }, (_, i) => {
    const close = i < 90 ? 1000 + i * 10 : 1890 - (i - 89) * 10;
    return { date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), open: close, high: close + 15, low: close - 15, close, volume: 1000 + (i % 7) * 100 };
  });
}

test("시나리오 3개는 실제 계산된 가격으로 조건·볼 가격·대응·무효화를 담고 단정 표현을 쓰지 않는다", () => {
  const c = candles();
  const chart = computeChartDetail(c, c[c.length - 1].close)!;
  const sc = buildScenarios(chart, computeVolumeDetail(c, { lastCandlePartial: false, quote: null, minutesSinceOpen: null }))!;
  assert.deepEqual(sc.map((s) => s.name), ["반등", "횡보", "추가 하락"]);
  for (const s of sc) {
    assert.ok(s.condition && s.watch && s.response && s.invalidation);
    assert.doesNotMatch(`${s.condition}${s.response}`, /당장 매도|무조건|반드시 매수/);
  }
  assert.match(sc[0].condition, /\d{1,3}(,\d{3})*원 위로 종가 회복/);
  assert.equal(buildScenarios(null, null), null);
});

test("버튼 callback_data는 64바이트 안이고, 형식이 다르면 거부한다", () => {
  const id = "cmvpy2a3z000708jy1jo4ajyw";
  const kb = summaryKeyboard([{ id, name: "LIG디펜스앤에어로스페이스" }]);
  for (const row of [...kb.inline_keyboard, ...detailKeyboard(id, "risk").inline_keyboard]) {
    for (const b of row) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  }
  assert.deepEqual(parseAlertCallback(`he:${id}:news`), { mode: "edit", id, section: "news" });
  assert.equal(parseAlertCallback(`hn:${id}:secret`), null);
  assert.equal(parseAlertCallback(`hn:../../etc:chart`), null);
  assert.equal(parseAlertCallback(undefined), null);
});

function row(payload: Partial<AlertRecordPayload>): AlertRecordRow {
  const full: AlertRecordPayload = {
    technical: { price: null, chart: null },
    volume: null,
    flow: null,
    financial: { years: [], signalNote: null },
    sector: { theme: null, move: null },
    news: { news: { ok: false, items: [] }, filings: { ok: false, items: [], total: 0 } },
    trigger: { reasons: [], signals: [], stateNote: "", deepLoss: null },
    action: { scenarios: null, thesis: null },
    portfolio: null,
    dataQuality: [],
    ...payload,
  };
  return {
    id: "cmvpy2a3z000708jy1jo4ajyw",
    stockCode: "054450",
    stockName: "텔레칩스",
    alertType: "worsened",
    generatedAt: new Date("2026-10-27T02:00:00Z"),
    marketDataAsOf: null,
    portfolioDataAsOf: "2026-10-27T02:00:00Z",
    previousSeverity: "축소검토",
    currentSeverity: "정밀점검",
    previousRiskScore: -3,
    currentRiskScore: -5,
    currentPrice: 10_000,
    avgBuyPrice: 20_000,
    holdingQuantity: 10,
    unrealizedReturnPct: -50,
    analysisVersion: "test",
    ...serializePayload(full),
  };
}

test("뉴스·공시 조회 실패를 '없음'으로 표시하지 않는다", () => {
  const text = renderSection("news", row({}));
  assert.match(text, /DART 조회 실패 — 공시가 없다는 뜻은 아니에요/);
  assert.match(text, /뉴스 조회 실패 — 뉴스가 없다는 뜻은 아니에요/);
  const ok = renderSection("news", row({ news: { news: { ok: true, items: [] }, filings: { ok: true, items: [], total: 3 } } }));
  assert.match(ok, /중요 공시 없음\(전체 3건/);
  assert.match(ok, /최근 7일 관련 기사 없음/);
});

test("위험·대응 화면: 등급 변화·신호 합계·투자 논리 안내·지시가 아니라는 고지", () => {
  const text = renderSection("risk", row({}));
  assert.match(text, /🟠축소검토 → \*\*🔴정밀점검\*\*/);
  assert.match(text, /신호 합계 -3 → -5/);
  assert.match(text, /매수 이유가 기록돼 있지 않아요/);
  assert.match(text, /매수·매도 지시가 아니라/);
});

test("보유정보: 평가손익을 평단·수량으로 다시 계산해 보여준다", () => {
  const text = renderSection("hold", row({}));
  assert.match(text, /매수금액 200,000원 → 평가금액 100,000원/);
  assert.match(text, /평가손익 \*\*-100,000원\(-50\.0%\)\*\*/);
});

test("모든 상세 화면은 한 메시지(3,500자) 안에 들어간다", () => {
  const longNews = Array.from({ length: 50 }, (_, i) => ({ title: `텔레칩스 기사 ${i} ${"가".repeat(80)}`, link: `https://n.example/${i}`, description: "", pubDate: "2026-10-27T01:00:00Z", source: "n" }));
  const r = row({ news: { news: { ok: true, items: longNews }, filings: { ok: true, items: [], total: 0 } } });
  for (const s of ["chart", "hold", "news", "risk", "port"] as const) assert.ok(renderSection(s, r).length <= 3500);
});

test("시각 표기는 한국 시간 월/일 시:분", () => {
  assert.equal(kstLabel("2026-10-27T02:07:00Z"), "10/27 11:07");
  assert.equal(kstLabel("2026-10-27"), "10/27"); // 날짜만 있으면 시각을 붙이지 않는다
});
