import { fetchFinancialHistoryByCode, type YearlyFinancials } from "@/lib/krx-financials";
import { fetchKisQuote } from "@/lib/kis-quote";
import { formatWon } from "@/lib/format";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "18px 20px",
};

type Row = {
  year: number;
  revenue: number;
  operatingProfit: number;
  netIncome: number;
  opMargin: number;
  netMargin: number;
  roe: number;
  debtRatio: number;
  eps: number;
  bps: number;
  per: number;
  pbr: number;
};

function pct(n: number): string {
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "-";
}
function whole(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : "-";
}
function times(n: number): string {
  return Number.isFinite(n) && n !== 0 ? `${n.toFixed(2)}배` : "-";
}

function buildRows(history: YearlyFinancials[], price: number, shares: number): Row[] {
  return history.map((f) => {
    const opMargin = f.revenue > 0 ? (f.operatingProfit / f.revenue) * 100 : NaN;
    const netMargin = f.revenue > 0 ? (f.netIncome / f.revenue) * 100 : NaN;
    const roe = f.totalEquity > 0 ? (f.netIncome / f.totalEquity) * 100 : NaN;
    const eps = shares > 0 ? f.netIncome / shares : NaN;
    const bps = shares > 0 ? f.totalEquity / shares : NaN;
    const per = price > 0 && eps !== 0 ? price / eps : NaN;
    const pbr = price > 0 && bps > 0 ? price / bps : NaN;
    return {
      year: f.year,
      revenue: f.revenue,
      operatingProfit: f.operatingProfit,
      netIncome: f.netIncome,
      opMargin,
      netMargin,
      roe,
      debtRatio: f.debtRatio,
      eps,
      bps,
      per,
      pbr,
    };
  });
}

const METRIC_ROWS: { label: string; get: (r: Row) => string }[] = [
  { label: "매출액", get: (r) => formatWon(r.revenue) },
  { label: "영업이익", get: (r) => formatWon(r.operatingProfit) },
  { label: "당기순이익", get: (r) => formatWon(r.netIncome) },
  { label: "영업이익률", get: (r) => pct(r.opMargin) },
  { label: "순이익률", get: (r) => pct(r.netMargin) },
  { label: "ROE", get: (r) => pct(r.roe) },
  { label: "부채비율", get: (r) => pct(r.debtRatio) },
  { label: "EPS(원)", get: (r) => whole(r.eps) },
  { label: "PER", get: (r) => times(r.per) },
  { label: "BPS(원)", get: (r) => whole(r.bps) },
  { label: "PBR", get: (r) => times(r.pbr) },
];

export async function EarningsAnalysis({ code }: { code: string }) {
  const nowYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date())
  );
  const years = [nowYear - 3, nowYear - 2, nowYear - 1, nowYear];

  const [history, quote] = await Promise.all([fetchFinancialHistoryByCode(code, years), fetchKisQuote(code)]);
  const rows = buildRows(history, quote?.price ?? 0, quote?.sharesOutstanding ?? 0);

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>기업실적분석</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>연간 · IFRS 연결</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 14, lineHeight: 1.5 }}>
        EPS·PER·BPS·PBR은 현재 발행주식수·주가 기준 계산값이라 실제 연도별 공시치와는 다를 수 있어요. 분기
        실적·증권사 추정치는 원천 데이터가 없어 아직 지원하지 않아요.
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--faint)" }}>실적 데이터를 아직 확인하지 못했어요.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `1.3fr repeat(${rows.length}, 1fr)`,
              minWidth: 460,
              fontFamily: "var(--mono)",
            }}
          >
            <div />
            {rows.map((r) => (
              <div key={r.year} style={{ fontSize: 11.5, color: "var(--dim)", textAlign: "right", padding: "0 0 10px" }}>
                {r.year}
              </div>
            ))}
            {METRIC_ROWS.map((m) => (
              <MetricRow key={m.label} label={m.label} rows={rows} get={m.get} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MetricRow({ label, rows, get }: { label: string; rows: Row[]; get: (r: Row) => string }) {
  return (
    <>
      <div
        style={{
          fontFamily: "var(--sans)",
          fontSize: 12.5,
          color: "var(--dim)",
          padding: "9px 0",
          borderTop: "1px solid var(--border)",
        }}
      >
        {label}
      </div>
      {rows.map((r) => (
        <div
          key={r.year}
          style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right", padding: "9px 0", borderTop: "1px solid var(--border)" }}
        >
          {get(r)}
        </div>
      ))}
    </>
  );
}
