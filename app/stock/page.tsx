import { prisma } from "@/lib/prisma";
import { chgColorVar, chgArrow, formatChg } from "@/lib/format";
import { StockPicker } from "@/components/stock/stock-picker";
import { DetailSections } from "@/components/stock/detail-sections";
import { WatchlistButton } from "@/components/stock/watchlist-button";
import { isWatched } from "@/lib/watchlist";
import { findLatestEntryByCode } from "@/lib/market-data";
import { refreshStockSnapshot } from "@/lib/krx-quote";
import { formatDateLabel } from "@/lib/dates";
import type { StockMaster } from "@/app/generated/prisma/client";

// A live refresh (price lookup + financial/industry enrichment) can take a
// few seconds under normal conditions — give it real room on Vercel rather
// than the platform's short default.
export const maxDuration = 30;

const DEFAULT_CODE = "042700"; // 한미반도체

type CurStock = Pick<StockMaster, "code" | "name" | "market" | "sector" | "price" | "changePct"> & {
  marketCap?: string | null;
  per?: string | null;
  pbr?: string | null;
  roe?: string | null;
  debtRatio?: string | null;
  revenue?: string | null;
  quoteDate?: string | null;
};

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  // Best-effort live refresh for whichever stock is about to be shown —
  // upserts fresh price/시가총액/PER/PBR/ROE/부채비율/매출액/업종 into
  // StockMaster before we read it, so repeat visits keep getting more
  // current the more a stock actually gets looked at. Falls back silently
  // (never throws) if data.go.kr is slow or the lookup fails.
  await refreshStockSnapshot(code || DEFAULT_CODE);

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
        marketCap: fallback.marketCap,
        per: fallback.per,
        pbr: fallback.pbr,
        roe: fallback.roe,
        debtRatio: fallback.debtRatio,
        revenue: fallback.revenue,
        quoteDate: fallback.date,
      };
    }
  }

  cur = cur ?? allStocks.find((s) => s.code === DEFAULT_CODE) ?? allStocks[0];
  const watched = await isWatched(cur.code);

  const stats: { label: string; value: string }[] = [
    cur.marketCap ? { label: "시가총액", value: cur.marketCap } : null,
    cur.per ? { label: "PER", value: cur.per } : null,
    cur.pbr ? { label: "PBR", value: cur.pbr } : null,
    cur.roe ? { label: "ROE", value: cur.roe } : null,
    cur.debtRatio ? { label: "부채비율", value: cur.debtRatio } : null,
  ].filter((s): s is { label: string; value: string } => s !== null);

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
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-block",
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
              {stats.map((s) => (
                <span
                  key={s.label}
                  style={{
                    display: "inline-block",
                    background: "var(--panel2)",
                    color: "var(--dim)",
                    fontFamily: "var(--mono)",
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                  }}
                >
                  {s.label} {s.value}
                </span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: chgColorVar(cur.changePct) }}>
              {cur.price}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: chgColorVar(cur.changePct), marginTop: 6 }}>
              {chgArrow(cur.changePct)} {formatChg(cur.changePct)}
            </div>
            {cur.quoteDate && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", marginTop: 4 }}>
                기준 {formatDateLabel(cur.quoteDate)}
              </div>
            )}
          </div>
        </div>
      </div>

      <DetailSections stockName={cur.name} />
    </main>
  );
}
