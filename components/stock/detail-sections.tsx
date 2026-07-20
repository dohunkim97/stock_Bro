import { fetchNews } from "@/lib/naver-news";
import { fetchPriceHistory, type PricePoint } from "@/lib/krx-quote";
import { fetchFinancialHistoryByCode } from "@/lib/krx-financials";
import { formatWon } from "@/lib/format";
import { NewsList } from "@/components/news-list";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "18px 20px",
};

const infoNoteStyle: React.CSSProperties = {
  padding: "16px 0",
  fontSize: 13,
  color: "var(--faint)",
  lineHeight: 1.6,
};

function buildChartPoints(history: PricePoint[]): string | null {
  if (history.length < 2) return null;
  const closes = history.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const w = 620;
  const h = 220;
  const pad = 18;

  return history
    .map((p, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - pad - ((p.close - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatAxisDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}.${d}`;
}

export async function DetailSections({
  stockName,
  code,
  market,
  marketCap,
  per,
  pbr,
  debtRatio,
}: {
  stockName: string;
  code: string;
  market: string;
  marketCap?: string | null;
  per?: string | null;
  pbr?: string | null;
  debtRatio?: string | null;
}) {
  const nowYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date())
  );

  const [news, priceHistory, financialHistory] = await Promise.all([
    fetchNews(stockName),
    fetchPriceHistory(code, 100),
    fetchFinancialHistoryByCode(code, [nowYear - 1, nowYear - 2]),
  ]);

  const chartPoints = buildChartPoints(priceHistory);
  const chartUp =
    priceHistory.length >= 2 && priceHistory[priceHistory.length - 1].close >= priceHistory[0].close;
  const chartColor = chartUp ? "var(--up)" : "var(--down)";
  const areaPoints = chartPoints ? `${chartPoints} 620,220 0,220` : null;

  const valuationStats = [
    marketCap ? { label: "시가총액", value: marketCap } : null,
    per ? { label: "PER", value: per } : null,
    pbr ? { label: "PBR", value: pbr } : null,
    debtRatio ? { label: "부채비율", value: debtRatio } : null,
  ].filter((s): s is { label: string; value: string } => s !== null);

  const financialRows =
    financialHistory.length > 0
      ? [
          { label: "매출액", values: financialHistory.map((f) => formatWon(f.revenue)) },
          { label: "영업이익", values: financialHistory.map((f) => formatWon(f.operatingProfit)) },
          { label: "순이익", values: financialHistory.map((f) => formatWon(f.netIncome)) },
          {
            label: "부채비율",
            values: financialHistory.map((f) => (Number.isFinite(f.debtRatio) ? `${f.debtRatio.toFixed(1)}%` : "-")),
          },
        ]
      : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 20, alignItems: "start" }}>
      {/* 차트 */}
      <section style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>주가 추이</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>
            최근 {priceHistory.length}거래일
          </span>
        </div>
        {!areaPoints ? (
          <div style={infoNoteStyle}>
            {stockName}의 최근 거래 데이터가 아직 충분하지 않아 그래프를 그릴 수 없어요.
          </div>
        ) : (
          <>
            <svg viewBox="0 0 620 220" preserveAspectRatio="none" style={{ width: "100%", height: 220, display: "block" }}>
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <line x1="0" y1="55" x2="620" y2="55" stroke="var(--border)" strokeWidth={1} />
              <line x1="0" y1="110" x2="620" y2="110" stroke="var(--border)" strokeWidth={1} />
              <line x1="0" y1="165" x2="620" y2="165" stroke="var(--border)" strokeWidth={1} />
              <polygon points={areaPoints} fill="url(#area)" />
              <polyline
                points={chartPoints ?? ""}
                fill="none"
                stroke={chartColor}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)", marginTop: 6 }}>
              <span>{formatAxisDate(priceHistory[0].date)}</span>
              <span>{formatAxisDate(priceHistory[Math.floor(priceHistory.length / 2)].date)}</span>
              <span>{formatAxisDate(priceHistory[priceHistory.length - 1].date)}</span>
            </div>
          </>
        )}
      </section>

      {/* 밸류에이션 */}
      <section style={panelStyle}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>밸류에이션</span>
        {valuationStats.length === 0 ? (
          <div style={infoNoteStyle}>밸류에이션 정보를 아직 확인하지 못했어요.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginTop: 15 }}>
            {valuationStats.map((v) => (
              <div key={v.label} style={{ background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 11, padding: "13px 14px" }}>
                <div style={{ fontSize: 11.5, color: "var(--dim)", marginBottom: 6 }}>{v.label}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 19, fontWeight: 700 }}>{v.value}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 핵심 재무 */}
      <section style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>
            핵심 재무{" "}
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", fontWeight: 400 }}>
              (연간)
            </span>
          </span>
        </div>
        {financialRows.length === 0 ? (
          <div style={infoNoteStyle}>재무 데이터를 아직 확인하지 못했어요.</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `1.2fr repeat(${financialHistory.length}, 1fr)`,
              gap: 0,
              fontFamily: "var(--mono)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--faint)", padding: "0 0 10px" }} />
            {financialHistory.map((f) => (
              <div key={f.year} style={{ fontSize: 11.5, color: "var(--dim)", textAlign: "right", padding: "0 0 10px" }}>
                {f.year}
              </div>
            ))}
            {financialRows.map((row) => (
              <FinancialRow key={row.label} label={row.label} values={row.values} />
            ))}
          </div>
        )}
      </section>

      {/* 사업/제품별 매출 비중 */}
      <section style={panelStyle}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>사업·제품별 매출 비중</span>
        <div style={infoNoteStyle}>
          공시 데이터에는 종목별 사업부문·제품별 매출 비중이 표 형태로 제공되지 않아서, 이 항목은
          아직 지원하지 않아요. 전체 매출액은 왼쪽 핵심 재무에서 확인할 수 있어요.
        </div>
      </section>

      {/* 최근 이슈·뉴스 */}
      <section style={{ ...panelStyle, gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 15 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>최근 이슈 · 뉴스</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
            네이버 뉴스 검색
          </span>
        </div>
        <NewsList items={news} emptyLabel={`${stockName} 관련 최근 뉴스가 없어요`} />
      </section>

      {/* 업종 내 경쟁사 비교 */}
      <section style={{ ...panelStyle, gridColumn: "1 / -1" }}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>업종 내 경쟁사 비교</span>
        <div style={infoNoteStyle}>
          같은 업종에 속한 다른 종목을 자동으로 찾아 비교하는 기능은 아직 준비 중이에요. {market} 종목
          검색은 상단 목록 버튼으로 직접 찾아볼 수 있어요.
        </div>
      </section>
    </div>
  );
}

function FinancialRow({ label, values }: { label: string; values: string[] }) {
  return (
    <>
      <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--dim)", padding: "11px 0", borderTop: "1px solid var(--border)" }}>
        {label}
      </div>
      {values.map((v, i) => (
        <div key={i} style={{ fontSize: 13, fontWeight: 600, textAlign: "right", padding: "11px 0", borderTop: "1px solid var(--border)" }}>
          {v}
        </div>
      ))}
    </>
  );
}
