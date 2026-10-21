// 매매일지 — 채팅에서 "매수했어"/"매도했어"라고 말한 사건을 그대로 한 행씩
// 남긴다(lib/golgoo-chat.ts의 record_holding_purchase/record_holding_sale이
// 호출). 매도의 실현손익은 "매도 시점" 평단가로 고정 계산해서 저장한다 —
// 나중에 같은 종목을 더 사서 평단가가 달라져도 이 행의 숫자는 그대로.

import { prisma } from "@/lib/prisma";
import { sellHolding, type SellResult } from "@/lib/portfolio";
import { daysBetween } from "@/lib/holding-assessment";

export async function recordBuyJournal(
  userId: string,
  input: { code: string; name: string; quantity: number; price: number; date: string }
) {
  return prisma.tradeJournalEntry.create({
    data: {
      userId,
      code: input.code,
      name: input.name,
      action: "BUY",
      date: input.date,
      quantity: input.quantity,
      price: input.price,
      amount: input.quantity * input.price,
    },
  });
}

export type SaleJournalResult = {
  soldQty: number;
  avgBuyPrice: number;
  realizedPnl: number;
  realizedPnlPct: number | null;
  fullyClosed: boolean;
};

// 실제 매도 처리(둥지 수량 차감, lib/portfolio.ts의 sellHolding)와 그 결과를
// 매매일지에 남기는 걸 한 번에 한다 — 보유 기록이 아예 없으면(이 종목을
// 산 적이 없는데 팔았다는 보고) null.
export async function recordSaleJournal(
  userId: string,
  input: { code: string; name: string; quantity: number; price: number; date: string }
): Promise<SaleJournalResult | null> {
  const sold: SellResult | null = await sellHolding(userId, input.code, input.quantity);
  if (!sold) return null;

  const realizedPnl = (input.price - sold.avgBuyPrice) * sold.soldQty;
  const realizedPnlPct = sold.avgBuyPrice > 0 ? ((input.price - sold.avgBuyPrice) / sold.avgBuyPrice) * 100 : null;
  const holdingDays = sold.firstBuyDate ? daysBetween(sold.firstBuyDate, input.date) : null;

  await prisma.tradeJournalEntry.create({
    data: {
      userId,
      code: input.code,
      name: input.name,
      action: "SELL",
      date: input.date,
      quantity: sold.soldQty,
      price: input.price,
      amount: sold.soldQty * input.price,
      costBasis: sold.avgBuyPrice,
      realizedPnl,
      realizedPnlPct,
      holdingDays,
    },
  });

  return { soldQty: sold.soldQty, avgBuyPrice: sold.avgBuyPrice, realizedPnl, realizedPnlPct, fullyClosed: sold.fullyClosed };
}

export function getTradeJournal(userId: string, limit = 50) {
  return prisma.tradeJournalEntry.findMany({ where: { userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: limit });
}

export async function removeTradeJournalEntry(userId: string, id: string) {
  return prisma.tradeJournalEntry.deleteMany({ where: { id, userId } }).catch(() => null);
}

// 실현손익 합계·승률 — 둥지 매매 리포트 상단 요약용. 코드가 계산해서
// LLM/화면 양쪽이 같은 숫자를 쓰게 한다.
export async function getRealizedSummary(userId: string) {
  const sells = await prisma.tradeJournalEntry.findMany({ where: { userId, action: "SELL" }, select: { realizedPnl: true } });
  const totalPnl = sells.reduce((s, r) => s + (r.realizedPnl ?? 0), 0);
  const wins = sells.filter((r) => (r.realizedPnl ?? 0) > 0).length;
  return { count: sells.length, totalPnl, winRate: sells.length > 0 ? (wins / sells.length) * 100 : null };
}
