import { fetchInvestorTrend, type InvestorTrendRow } from "@/lib/kis-investor-trend";
import { formatWon } from "@/lib/format";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "18px 20px",
};

function signed(n: number): string {
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "-"}${formatWon(Math.abs(n))}`;
}
function colorFor(n: number): string {
  return n > 0 ? "var(--up)" : n < 0 ? "var(--down)" : "var(--faint)";
}

export async function InvestorTrend({ code }: { code: string }) {
  const rows = await fetchInvestorTrend(code, 10);

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>투자자별 매매동향</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
          최근 {rows.length || 10}거래일 · 순매수대금
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--faint)", marginTop: 10, lineHeight: 1.6 }}>
          투자자별 매매동향 데이터를 아직 가져오지 못했어요.
        </div>
      ) : (
        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "56px repeat(3, 1fr)", minWidth: 340, fontFamily: "var(--mono)" }}>
            <div style={{ fontSize: 10.5, color: "var(--faint)", padding: "0 0 8px" }}>날짜</div>
            {["개인", "외국인", "기관"].map((l) => (
              <div key={l} style={{ fontSize: 10.5, color: "var(--faint)", textAlign: "right", padding: "0 0 8px" }}>
                {l}
              </div>
            ))}
            {rows.map((r) => (
              <TrendRow key={r.date} row={r} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TrendRow({ row }: { row: InvestorTrendRow }) {
  const cellStyle: React.CSSProperties = {
    fontSize: 11.5,
    fontWeight: 600,
    textAlign: "right",
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  };
  return (
    <>
      <div style={{ fontSize: 11.5, color: "var(--dim)", padding: "8px 0", borderTop: "1px solid var(--border)" }}>
        {row.date.slice(5)}
      </div>
      <div style={{ ...cellStyle, color: colorFor(row.individual) }}>{signed(row.individual)}</div>
      <div style={{ ...cellStyle, color: colorFor(row.foreign) }}>{signed(row.foreign)}</div>
      <div style={{ ...cellStyle, color: colorFor(row.institution) }}>{signed(row.institution)}</div>
    </>
  );
}
