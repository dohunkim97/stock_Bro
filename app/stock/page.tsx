import { prisma } from "@/lib/prisma";
import { chgColorVar, chgArrow, formatChg } from "@/lib/format";
import { StockPicker } from "@/components/stock/stock-picker";
import { PriceChart } from "@/components/stock/price-chart";
import { DetailSections } from "@/components/stock/detail-sections";
import { WatchlistButton } from "@/components/stock/watchlist-button";
import { GolgooProvider } from "@/components/stock/golgoo-context";
import { GolgooEvidenceButton } from "@/components/stock/golgoo-evidence-button";
import { GolgooPanel } from "@/components/stock/golgoo-panel";
import { isWatched } from "@/lib/watchlist";
import { findLatestEntryByCode } from "@/lib/market-data";
import { refreshStockSnapshot } from "@/lib/krx-quote";
import { formatDateLabel, todayISO } from "@/lib/dates";
import { simplifyIndustry } from "@/lib/industry-labels";
import { getCompanyKeywords } from "@/lib/company-keywords";
import { getLatestPrediction, parsePredictionCandidates } from "@/lib/prediction-scoring";
import type { StockMaster } from "@/app/generated/prisma/client";

// A live refresh (price lookup + financial/industry enrichment) can take
// 15-25s under real production latency, plus DetailSections' own fetches
// after it — give this real room on Vercel rather than the platform's
// short default.
export const maxDuration = 45;

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
  const [watched, keywords, latestPrediction] = await Promise.all([
    isWatched(cur.code),
    getCompanyKeywords(cur.code, cur.name),
    getLatestPrediction(),
  ]);
  // "🥚 골구 근거" 버튼/패널/차트 오버레이는 이 종목이 실제로 골구의 현재
  // 예상종목 중 하나일 때만 켠다 — 무거운 근거 계산(app/api/stock/golgoo-
  // evidence)은 버튼을 눌렀을 때만 하고, 여기선 candidates 코드 목록만
  // 훑어서 available 여부만 싸게 판단한다.
  const isGolgooCandidate = latestPrediction
    ? parsePredictionCandidates(latestPrediction.candidates).some((c) => c.code === cur.code)
    : false;

  const stats: { label: string; value: string }[] = [
    cur.marketCap ? { label: "시가총액", value: cur.marketCap } : null,
    cur.per ? { label: "PER", value: cur.per } : null,
    cur.pbr ? { label: "PBR", value: cur.pbr } : null,
    cur.roe ? { label: "ROE", value: cur.roe } : null,
    cur.debtRatio ? { label: "부채비율", value: cur.debtRatio } : null,
  ].filter((s): s is { label: string; value: string } => s !== null);

  return (
    <GolgooProvider available={isGolgooCandidate}>
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
              <GolgooEvidenceButton />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
              <span
                title={cur.sector}
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
                {simplifyIndustry(cur.sector)} · {cur.market}
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
              {keywords.map((k) => (
                <span
                  key={k}
                  title="최근 뉴스 기반 AI 추출 — 매출·수출·사업 키워드"
                  style={{
                    display: "inline-block",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 6,
                  }}
                >
                  {k}
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
                {cur.quoteDate === todayISO() && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 700, color: "#22c55e" }}>
                    실시간
                  </span>
                )}
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>
                  기준 {formatDateLabel(cur.quoteDate)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PriceChart key={cur.code} code={cur.code} />
        </div>
        {isGolgooCandidate && <GolgooPanel code={cur.code} />}
      </div>

      <DetailSections stockName={cur.name} code={cur.code} market={cur.market} />
    </main>
    </GolgooProvider>
  );
}
