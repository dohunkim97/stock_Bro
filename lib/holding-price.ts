// 보유종목 알림의 "주가 정보" — 오늘 등락(전일 종가 대비)과 내 손익(평단 대비)을
// 절대 섞지 않으려고 오늘 등락 쪽만 여기서 따로 계산한다. 순수 함수(네트워크·
// DB 없음)라 테스트로 바로 검증한다(tests/holding-alerts.test.ts).

import type { KisQuote } from "@/lib/kis-quote";
import type { MarketSession } from "@/lib/dates";

export type PriceSnapshot = {
  price: number;
  priceLabel: "현재가" | "종가";
  prevClose: number | null;
  changeAmount: number | null; // 원, 전일 종가 대비
  changePct: number | null; // %, 전일 종가 대비
  asOf: string; // ISO(실시간) 또는 YYYY-MM-DD(일봉 대체)
  session: MarketSession;
  live: boolean; // false면 실시간 시세 조회 실패 — 실시간 가격처럼 표시하면 안 됨
  source: string;
  tradingHalted: boolean;
  statusLabel: string | null;
};

type CandleLike = { date: string; close: number };

// (현재가 - 전일 종가) / 전일 종가 × 100 — 사용자 스펙 그대로.
export function dailyChange(price: number, prevClose: number | null): { amount: number | null; pct: number | null } {
  if (prevClose === null || prevClose <= 0) return { amount: null, pct: null };
  const amount = price - prevClose;
  return { amount, pct: (amount / prevClose) * 100 };
}

export function buildPriceSnapshot(quote: KisQuote | null, candles: CandleLike[], session: MarketSession): PriceSnapshot | null {
  const priceLabel = session === "장중" ? "현재가" : "종가";

  if (quote) {
    // 기준가가 응답에 없을 때만 KIS가 준 등락률을 그대로 쓴다 — 원 단위는
    // 역산하면 반올림 오차가 생겨 지어낸 숫자가 되므로 비워 둔다.
    const { amount, pct } = dailyChange(quote.price, quote.prevClose);
    return {
      price: quote.price,
      priceLabel,
      prevClose: quote.prevClose,
      changeAmount: amount,
      changePct: pct ?? quote.changePct,
      asOf: quote.fetchedAt,
      session,
      live: true,
      source: "KIS 실시간 시세",
      tradingHalted: quote.tradingHalted,
      statusLabel: quote.statusLabel,
    };
  }

  if (candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const prev = candles.length >= 2 ? candles[candles.length - 2].close : null;
  const { amount, pct } = dailyChange(last.close, prev);
  return {
    price: last.close,
    priceLabel: "종가",
    prevClose: prev,
    changeAmount: amount,
    changePct: pct,
    asOf: last.date,
    session,
    live: false,
    source: "KIS 일봉(실시간 시세 조회 실패)",
    tradingHalted: false,
    statusLabel: null,
  };
}
