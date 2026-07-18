import { prisma } from "@/lib/prisma";

export function getWatchlist() {
  return prisma.watchlist.findMany({ orderBy: { createdAt: "desc" } });
}

export function isWatched(code: string) {
  return prisma.watchlist.findUnique({ where: { code } }).then((w) => !!w);
}

export function addToWatchlist(input: {
  code: string;
  name: string;
  market?: string | null;
  sector?: string | null;
}) {
  return prisma.watchlist.upsert({
    where: { code: input.code },
    update: {},
    create: {
      code: input.code,
      name: input.name,
      market: input.market ?? null,
      sector: input.sector ?? null,
    },
  });
}

export function removeFromWatchlist(code: string) {
  return prisma.watchlist.delete({ where: { code } }).catch(() => null);
}
