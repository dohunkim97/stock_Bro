// Real daily trading value per themed stock, independent of whether that
// stock happened to rank in that day's gainer/loser/volume TOP lists — see
// the ThemeDailyFlow model comment in schema.prisma for why this exists.

import { prisma } from "@/lib/prisma";
import { fetchKisQuote } from "@/lib/kis-quote";
import { resolveStock } from "@/lib/market-data";
import { formatWon } from "@/lib/format";
import { fetchAllRows, parseRow } from "@/lib/krx-sync";
import { toYYYYMMDD } from "@/lib/dates";

// Same concurrency/backoff as lib/kis-ranking.ts's enrichWithKisQuote —
// that value was tuned against real observed KIS rate-limit behavior, not
// picked arbitrarily, so this reuses it rather than guessing a different one.
const CONCURRENCY = 6;
const BATCH_GAP_MS = 250;

// LLM-extracted theme sources (Telegram/KIS news/Naver news) only ever see a
// company name in text, so their StockTheme rows land without a code —
// backfill it via the same fuzzy name lookup the ranking-upload path uses.
// ETF sync (lib/kis-etf-holdings.ts) already knows the code up front and
// writes it directly, so this only has work to do for the other sources.
async function resolveMissingCodes(): Promise<void> {
  const rows = await prisma.stockTheme.findMany({ where: { code: null } });
  for (const r of rows) {
    const stock = await resolveStock(r.name);
    if (stock?.code) {
      await prisma.stockTheme.update({ where: { name: r.name }, data: { code: stock.code } }).catch(() => {});
    }
  }
}

export async function syncThemeDailyFlow(date: string): Promise<void> {
  await resolveMissingCodes();

  const themed = await prisma.stockTheme.findMany({ where: { code: { not: null } } });
  // Same stock can end up tagged under more than one name variant in rare
  // cases — dedupe by code so it isn't quoted (and counted) twice.
  const byCode = new Map(themed.map((t) => [t.code!, t]));
  const targets = [...byCode.values()];
  if (targets.length === 0) return;

  const rows: {
    date: string;
    code: string;
    name: string;
    theme: string;
    tradingValue: string;
    changePct: number;
    marketCap: string | null;
  }[] = [];

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, BATCH_GAP_MS));
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (t) => {
        const q = await fetchKisQuote(t.code!);
        if (!q || q.tradingValue <= 0) return;
        rows.push({
          date,
          code: t.code!,
          name: t.name,
          theme: t.theme,
          tradingValue: formatWon(q.tradingValue),
          changePct: q.changePct,
          marketCap: q.marketCap > 0 ? formatWon(q.marketCap) : null,
        });
      })
    );
  }

  if (rows.length === 0) return;

  // Idempotent re-run for the same date (e.g. a retried cron invocation)
  // replaces rather than duplicates.
  await prisma.$transaction([
    prisma.themeDailyFlow.deleteMany({ where: { date } }),
    prisma.themeDailyFlow.createMany({ data: rows }),
  ]);
}

export async function getThemeDailyFlowInRange(startISO: string, endISO: string) {
  return prisma.themeDailyFlow.findMany({
    where: { date: { gte: startISO, lte: endISO } },
  });
}

// One-off backfill for past dates — fetchKisQuote (used by syncThemeDailyFlow
// above) only ever returns the *current* quote, so it can't populate history.
// data.go.kr's daily snapshot (the same one lib/krx-sync.ts already uses to
// backfill past DailyEntry dates) does take a basDt, and one call returns the
// whole market for that day — cheaper than a per-stock historical lookup
// would be, since it's one bulk fetch per day filtered down to the themed
// codes rather than N per-stock calls per day.
export async function backfillThemeDailyFlow(
  days: string[]
): Promise<{ date: string; count: number }[]> {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) return days.map((date) => ({ date, count: 0 }));

  await resolveMissingCodes();

  const themed = await prisma.stockTheme.findMany({ where: { code: { not: null } } });
  const byCode = new Map(themed.map((t) => [t.code!, t]));
  if (byCode.size === 0) return days.map((date) => ({ date, count: 0 }));

  const results: { date: string; count: number }[] = [];

  for (const date of days) {
    const basDt = toYYYYMMDD(date);
    let flowRows: {
      date: string;
      code: string;
      name: string;
      theme: string;
      tradingValue: string;
      changePct: number;
      marketCap: string | null;
    }[] = [];

    try {
      const raw = await fetchAllRows(basDt, serviceKey);
      const mapped = raw
        .map(parseRow)
        .filter((r) => r !== null && byCode.has(r.code) && r.tradingValue > 0)
        .map((r) => {
          const t = byCode.get(r!.code)!;
          return {
            date,
            code: r!.code,
            name: t.name,
            theme: t.theme,
            tradingValue: formatWon(r!.tradingValue),
            changePct: r!.changePct,
            marketCap: r!.marketCap > 0 ? formatWon(r!.marketCap) : null,
          };
        });
      // data.go.kr's daily snapshot has occasionally listed the same code
      // twice for one basDt — dedupe before writing so it doesn't trip the
      // (date, code) unique constraint.
      flowRows = [...new Map(mapped.map((r) => [r.code, r])).values()];
    } catch {
      // best-effort — a bad day (holiday, API hiccup) shouldn't abort the rest
    }

    if (flowRows.length > 0) {
      await prisma.$transaction([
        prisma.themeDailyFlow.deleteMany({ where: { date } }),
        prisma.themeDailyFlow.createMany({ data: flowRows }),
      ]);
    }
    results.push({ date, count: flowRows.length });
  }

  return results;
}
