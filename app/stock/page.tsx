import { prisma } from "@/lib/prisma";
import { chgColorVar, chgArrow, formatChg } from "@/lib/format";
import { StockPicker } from "@/components/stock/stock-picker";
import { DetailSections } from "@/components/stock/detail-sections";
import { WatchlistButton } from "@/components/stock/watchlist-button";
import { isWatched } from "@/lib/watchlist";
import { findLatestEntryByCode } from "@/lib/market-data";
import type { StockMaster } from "@/app/generated/prisma/client";

const DEFAULT_CODE = "042700"; // 한미반도체

type CurStock = Pick<StockMaster, "code" | "name" | "market" | "sector" | "price" | "changePct">;

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const allStocks = await prisma.stockMaster.findMany({ orderBy: { name: "asc" } });
  let cur: CurStock | undefined = allStocks.find((s) => s.code === code);

  // Most stocks that show up via KRX sync aren't in the curated StockMaster
  // seed list — fall back to their latest ranking snapshot instead of
  // silently defaulting to a different stock.
  if (!cur && code) {
    const fallback = await findLatestEntryByCode(code);
    if (fallback?.code) {
      cur = {
        code: fallback.code,
        name: fallback.name,
        market: fallback.market ?? "-",
        sector: fallback.sector,
        price: fallback.price,
        changePct: fallback.changePct,
      };
    }
  }

  cur = cur ?? allStocks.find((s) => s.code === DEFAULT_CODE) ?? allStocks[0];
  const watched = await isWatched(cur.code);

  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "26px 24px 60px" }}>
      <div style={{ position: "relative", marginBottom: 22, zIndex: 30 }}>
        <StockPicker stocks={allStocks} currentCode={cur.code} />

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>{cur.name}</h1>
              <span style={{ fontFamily: "var(--mono)", fontSize: 16, color: "var(--dim)" }}>{cur.code}</span>
              <WatchlistButton
                code={cur.code}
                name={cur.name}
                market={cur.market}
                sector={cur.sector}
                initialWatched={watched}
              />
            </div>
            <span
              style={{
                display: "inline-block",
                marginTop: 9,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                fontFamily: "var(--mono)",
                fontSize: 11.5,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 6,
              }}
            >
              {cur.sector} · {cur.market}
            </span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: chgColorVar(cur.changePct) }}>
              {cur.price}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: chgColorVar(cur.changePct), marginTop: 6 }}>
              {chgArrow(cur.changePct)} {formatChg(cur.changePct)}
            </div>
          </div>
        </div>
      </div>

      <DetailSections />
    </main>
  );
}
