import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";
import {
  KR_STOCKS,
  SEED_DATE,
  SEED_TOP_VOLUME,
  SEED_TOP_GAINERS,
} from "../lib/stock-master-data";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({
  url: path.resolve(process.cwd(), url.replace(/^file:/, "")),
});
const prisma = new PrismaClient({ adapter });

function sectorFor(name: string) {
  return KR_STOCKS.find((s) => s.name === name)?.sector ?? "기타";
}

function codeFor(name: string) {
  return KR_STOCKS.find((s) => s.name === name)?.code ?? null;
}

async function main() {
  for (const s of KR_STOCKS) {
    await prisma.stockMaster.upsert({
      where: { name: s.name },
      update: { code: s.code, market: s.market, sector: s.sector, price: s.price, changePct: s.changePct },
      create: { name: s.name, code: s.code, market: s.market, sector: s.sector, price: s.price, changePct: s.changePct },
    });
  }

  const existing = await prisma.dailyEntry.count({ where: { date: SEED_DATE } });
  if (existing === 0) {
    for (const e of SEED_TOP_VOLUME) {
      await prisma.dailyEntry.create({
        data: {
          date: SEED_DATE,
          listType: "volume",
          rank: e.rank,
          name: e.name,
          code: codeFor(e.name),
          sector: sectorFor(e.name),
          price: e.price,
          changePct: e.changePct,
          volume: e.volume,
        },
      });
    }
    for (const e of SEED_TOP_GAINERS) {
      await prisma.dailyEntry.create({
        data: {
          date: SEED_DATE,
          listType: "gainer",
          rank: e.rank,
          name: e.name,
          code: codeFor(e.name),
          sector: sectorFor(e.name),
          price: e.price,
          changePct: e.changePct,
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
