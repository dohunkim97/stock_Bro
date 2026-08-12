import { prisma } from "@/lib/prisma";
import { STORAGE_CAP } from "@/lib/constants";

export type ListType = "volume" | "gainer";
export { STORAGE_CAP };

export type UploadRow = {
  rank: number;
  name: string;
  market: string;
  price: string;
  changePct: number;
  code?: string;
  sector?: string;
  volume?: string;
  tradingValue?: string;
  marketCap?: string;
  per?: string;
  pbr?: string;
  roe?: string;
  debtRatio?: string;
  reserveRatio?: string;
  industry?: string;
  revenue?: string;
  issue?: string;
};

export async function resolveStock(name: string) {
  const trimmed = name.trim();
  const exact = await prisma.stockMaster.findFirst({
    where: { name: trimmed },
  });
  if (exact) return exact;
  return prisma.stockMaster.findFirst({
    where: { name: { contains: trimmed } },
  });
}

export async function getDayEntries(date: string) {
  const [volume, gainer] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { date, listType: "volume" },
      orderBy: { rank: "asc" },
    }),
    prisma.dailyEntry.findMany({
      where: { date, listType: "gainer" },
      orderBy: { rank: "asc" },
    }),
  ]);
  return { volume, gainer };
}

// Falls back to the most recent ranking snapshot for a code that isn't in
// StockMaster's curated seed list — used by the stock detail page so any
// code that ever showed up in a KRX sync resolves to real data instead of
// silently defaulting to the wrong stock.
export async function findLatestEntryByCode(code: string) {
  return prisma.dailyEntry.findFirst({
    where: { code },
    orderBy: { date: "desc" },
  });
}

// Entries within an inclusive date range, both list types combined — the
// data source for the weekly sector rollup and the most-mentioned-stocks
// ranking on the market home screen.
export async function getEntriesInRange(startISO: string, endISO: string) {
  return prisma.dailyEntry.findMany({
    where: { date: { gte: startISO, lte: endISO } },
    orderBy: { date: "desc" },
  });
}

export async function addEntry(input: {
  date: string;
  listType: ListType;
  name: string;
  price: string;
  changePct: number;
  volume?: string;
}) {
  const count = await prisma.dailyEntry.count({
    where: { date: input.date, listType: input.listType },
  });
  if (count >= STORAGE_CAP) {
    throw new Error(`이미 ${STORAGE_CAP}종목이 입력되었어요`);
  }
  const stock = await resolveStock(input.name);
  return prisma.dailyEntry.create({
    data: {
      date: input.date,
      listType: input.listType,
      rank: count + 1,
      name: input.name.trim(),
      code: stock?.code ?? null,
      sector: stock?.sector ?? "기타",
      market: stock?.market ?? null,
      price: input.price.trim(),
      changePct: input.changePct,
      volume: input.volume?.trim() || null,
    },
  });
}

// Registers every stock seen in a sync into StockMaster — without this,
// only the ~30 curated seed stocks (plus whichever ones a user happened to
// open individually, triggering lib/krx-quote.ts's live refresh) were ever
// searchable from the stock detail picker, even though DailyEntry has been
// tracking far more of them every day via automated sync. Best-effort: a
// single row failing (e.g. a rare name/code collision) shouldn't break the
// sync that's actually storing the ranking data.
async function registerStocksInMaster(rows: UploadRow[]) {
  const byCode = new Map<string, UploadRow>();
  for (const r of rows) {
    const code = r.code?.trim();
    if (code) byCode.set(code, r); // later rows (gainer after volume) win on dupes, fine either way
  }
  if (byCode.size === 0) return;

  await Promise.all(
    [...byCode.values()].map((r) =>
      prisma.stockMaster
        .upsert({
          where: { code: r.code!.trim() },
          create: {
            code: r.code!.trim(),
            name: r.name.trim(),
            market: r.market.trim() || "-",
            sector: r.sector?.trim() || "기타",
            price: r.price.trim(),
            changePct: r.changePct,
            marketCap: r.marketCap?.trim() || undefined,
            per: r.per?.trim() || undefined,
            pbr: r.pbr?.trim() || undefined,
            roe: r.roe?.trim() || undefined,
            debtRatio: r.debtRatio?.trim() || undefined,
            revenue: r.revenue?.trim() || undefined,
            industry: r.industry?.trim() || undefined,
          },
          // Keep price/changePct current on every sync, but don't touch the
          // richer fields (per/pbr/roe/...) here — a live single-stock
          // refresh (lib/krx-quote.ts) often knows those better than a daily
          // ranking snapshot does, so this should never blank them out.
          update: {
            name: r.name.trim(),
            market: r.market.trim() || undefined,
            price: r.price.trim(),
            changePct: r.changePct,
          },
        })
        .catch(() => null)
    )
  );
}

// Replaces the day's entries wholesale from an uploaded spreadsheet — the
// upload is treated as the authoritative record for that date, not a merge.
//
// Resolves all stock-master lookups in one batch query up front (rather than
// one round trip per row inside the transaction) — with 50-100 rows per
// list, per-row lookups blow past Prisma's interactive-transaction timeout.
export async function replaceDayEntries(
  date: string,
  data: { volume: UploadRow[]; gainer: UploadRow[] }
) {
  const volumeRows = data.volume.slice(0, STORAGE_CAP);
  const gainerRows = data.gainer.slice(0, STORAGE_CAP);
  const names = [...new Set([...volumeRows, ...gainerRows].map((r) => r.name.trim()))];
  const stocks = names.length
    ? await prisma.stockMaster.findMany({ where: { name: { in: names } } })
    : [];
  const stockByName = new Map(stocks.map((s) => [s.name, s]));

  const build = (rows: UploadRow[], listType: ListType) =>
    rows.map((row, i) => {
      const stock = stockByName.get(row.name.trim());
      return {
        date,
        listType,
        rank: i + 1,
        name: row.name.trim(),
        code: row.code?.trim() || stock?.code || null,
        sector: row.sector?.trim() || stock?.sector || "기타",
        market: row.market.trim() || stock?.market || null,
        price: row.price.trim(),
        changePct: row.changePct,
        volume: row.volume?.trim() || null,
        tradingValue: row.tradingValue?.trim() || null,
        marketCap: row.marketCap?.trim() || null,
        per: row.per?.trim() || null,
        pbr: row.pbr?.trim() || null,
        roe: row.roe?.trim() || null,
        debtRatio: row.debtRatio?.trim() || null,
        reserveRatio: row.reserveRatio?.trim() || null,
        industry: row.industry?.trim() || null,
        revenue: row.revenue?.trim() || null,
        issue: row.issue?.trim() || null,
      };
    });

  const rows = [...build(volumeRows, "volume"), ...build(gainerRows, "gainer")];

  await prisma.$transaction([
    prisma.dailyEntry.deleteMany({ where: { date } }),
    ...(rows.length ? [prisma.dailyEntry.createMany({ data: rows })] : []),
  ]);

  await registerStocksInMaster([...volumeRows, ...gainerRows]);
}
