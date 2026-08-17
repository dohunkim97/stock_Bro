import Link from "next/link";
import { formatWon } from "@/lib/format";
import type { ThemeNetRank, NetFlowStock } from "@/lib/money-flow";

function netColor(net: number): string {
  return net > 0 ? "var(--up)" : net < 0 ? "var(--down)" : "var(--faint)";
}

function StockChips({ stocks }: { stocks: NetFlowStock[] }) {
  if (stocks.length === 0) return <span style={{ color: "var(--faint)" }}>-</span>;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {stocks.map((s, i) => (
        <span key={s.name}>
          <Link
            href={s.code ? `/stock?code=${s.code}` : "/stock"}
            className="hover-accent-border"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span style={{ color: "var(--text)" }}>{s.name}</span>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: netColor(s.net) }}>
              {s.net > 0 ? "+" : s.net < 0 ? "-" : ""}
              {formatWon(Math.abs(s.net))}
            </span>
          </Link>
          {i < stocks.length - 1 && <span style={{ color: "var(--faint)", margin: "0 4px" }}>·</span>}
        </span>
      ))}
    </span>
  );
}

function ThemeRow({ item }: { item: ThemeNetRank }) {
  return (
    <div style={{ padding: "9px 0", borderTop: "1px solid var(--border)", fontSize: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{item.name}</span>
        <div style={{ overflowX: "auto", minWidth: 0 }}>
          <StockChips stocks={item.stocks} />
        </div>
      </div>
    </div>
  );
}

// ThemeNetFlowPanel과 같은 순매수/순매도 2열 구조 — 짝을 이루는 그 패널과 행
// 수·행 높이가 최대한 비슷하게 맞도록.
export function ThemeNetFlowStocksPanel({
  buying,
  selling,
}: {
  buying: ThemeNetRank[];
  selling: ThemeNetRank[];
}) {
  const hasData = buying.length > 0 || selling.length > 0;

  return (
    <section
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 22,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>🏢 순매수·순매도 테마별 종목</span>
      </div>

      {!hasData ? (
        <div style={{ fontSize: 13.5, color: "var(--dim)" }}>표시할 테마가 아직 없어요.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--up)", marginBottom: 4 }}>▲ 순매수 상위</div>
            {buying.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--faint)", padding: "9px 0" }}>해당 없음</div>
            ) : (
              buying.map((b) => <ThemeRow key={b.name} item={b} />)
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--down)", marginBottom: 4 }}>▼ 순매도 상위</div>
            {selling.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--faint)", padding: "9px 0" }}>해당 없음</div>
            ) : (
              selling.map((s) => <ThemeRow key={s.name} item={s} />)
            )}
          </div>
        </div>
      )}
    </section>
  );
}
