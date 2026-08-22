import { chgColorVar, chgArrow, formatChg } from "@/lib/format";
import type { IndexQuote } from "@/lib/kis-index-quote";

// 업종상위/테마상위 옆 세 번째 작은 칸 — 코스피/코스닥/코스피200 (국내),
// 코스피200 야간선물(CME 연계), 나스닥/다우산업/홍콩H지수(해외)를 한눈에.
export function IndexQuotePanel({ quotes }: { quotes: IndexQuote[] }) {
  return (
    <section
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>주요 지수</div>

      {quotes.length === 0 ? (
        <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "4px 0" }}>지수 데이터를 아직 가져오지 못했어요.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {quotes.map((q) => (
            <div key={q.name} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11.5, color: "var(--dim)", whiteSpace: "nowrap" }}>{q.name}</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: "var(--mono)" }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{q.price.toLocaleString()}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: chgColorVar(q.changePct), whiteSpace: "nowrap" }}>
                  {chgArrow(q.changePct)} {formatChg(q.changePct)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
