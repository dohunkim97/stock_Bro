import { prisma } from "@/lib/prisma";
import { chgColorVar, chgArrow, formatChg } from "@/lib/format";
import { StockPicker } from "@/components/stock/stock-picker";
import { DetailSections } from "@/components/stock/detail-sections";

const DEFAULT_CODE = "042700"; // 한미반도체

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const allStocks = await prisma.stockMaster.findMany({ orderBy: { name: "asc" } });
  const cur =
    allStocks.find((s) => s.code === code) ??
    allStocks.find((s) => s.code === DEFAULT_CODE) ??
    allStocks[0];

  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "26px 24px 60px" }}>
      <div style={{ position: "relative", marginBottom: 22, zIndex: 30 }}>
        <StockPicker stocks={allStocks} currentCode={cur.code} />

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>{cur.name}</h1>
              <span style={{ fontFamily: "var(--mono)", fontSize: 16, color: "var(--dim)" }}>{cur.code}</span>
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
