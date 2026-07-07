import { prisma } from "@/lib/prisma";

export type ListType = "volume" | "gainer";
export const MAX_ENTRIES = 10;

export type UploadRow = {
  rank: number;
  name: string;
  market: string;
  price: string;
  changePct: number;
  volume?: string;
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
  if (count >= MAX_ENTRIES) {
    throw new Error(`이미 ${MAX_ENTRIES}종목이 입력되었어요`);
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

// Replaces the day's entries wholesale from an uploaded spreadsheet — the
// upload is treated as the authoritative record for that date, not a merge.
export async function replaceDayEntries(
  date: string,
  data: { volume: UploadRow[]; gainer: UploadRow[] }
) {
  await prisma.$transaction(async (tx) => {
    await tx.dailyEntry.deleteMany({ where: { date } });

    const build = async (rows: UploadRow[], listType: ListType) => {
      const built = [];
      for (const [i, row] of rows.slice(0, MAX_ENTRIES).entries()) {
        const stock = await resolveStock(row.name);
        built.push({
          date,
          listType,
          rank: i + 1,
          name: row.name.trim(),
          code: stock?.code ?? null,
          sector: stock?.sector ?? "기타",
          market: row.market.trim() || stock?.market || null,
          price: row.price.trim(),
          changePct: row.changePct,
          volume: row.volume?.trim() || null,
        });
      }
      return built;
    };

    const rows = [
      ...(await build(data.volume, "volume")),
      ...(await build(data.gainer, "gainer")),
    ];
    if (rows.length) await tx.dailyEntry.createMany({ data: rows });
  });
}

export async function deleteEntry(id: string) {
  const entry = await prisma.dailyEntry.delete({ where: { id } });
  const remaining = await prisma.dailyEntry.findMany({
    where: { date: entry.date, listType: entry.listType },
    orderBy: { rank: "asc" },
  });
  await Promise.all(
    remaining.map((e, i) =>
      e.rank === i + 1
        ? Promise.resolve()
        : prisma.dailyEntry.update({ where: { id: e.id }, data: { rank: i + 1 } })
    )
  );
}
