import { formatWon } from "@/lib/format";
import { RankBadge } from "./rank-badge";
import type { ThemeNetRank } from "@/lib/money-flow";

function NetRow({ item, direction, rank }: { item: ThemeNetRank; direction: "buy" | "sell"; rank: number }) {
  const color = direction === "buy" ? "var(--up)" : "var(--down)";
  const amount = formatWon(Math.abs(item.totalNet));
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}>
        <RankBadge rank={rank} />
        {item.name}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--mono)", fontSize: 12 }}>
        <span style={{ color: "var(--faint)" }}>{item.stockCount}종목</span>
        <span style={{ fontWeight: 700, color }}>
          {direction === "buy" ? "+" : "-"}
          {amount}
        </span>
      </span>
    </div>
  );
}

export function ThemeNetFlowPanel({
  days,
  buying,
  selling,
}: {
  days: number;
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>🔀 순매수·순매도 상위 테마</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>
          최근 {days}거래일 · 외국인+기관 누적 순매수
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 16, lineHeight: 1.5 }}>
        테마에 태깅된 종목들의 외국인+기관 순매수 거래대금을 다 더한 값이에요. 거래가 활발한 것(위쪽
        &quot;시장 관심 상위 테마&quot;)과는 다른 지표로, 사는 쪽이 우세한지 파는 쪽이 우세한지를 봐요.
      </div>

      {!hasData ? (
        <div style={{ fontSize: 13.5, color: "var(--dim)" }}>비교할 만한 순매수·순매도 데이터가 아직 없어요.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--up)", marginBottom: 4 }}>▲ 순매수 상위</div>
            {buying.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--faint)", padding: "9px 0" }}>해당 없음</div>
            ) : (
              buying.map((b, i) => <NetRow key={b.name} item={b} direction="buy" rank={i + 1} />)
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--down)", marginBottom: 4 }}>▼ 순매도 상위</div>
            {selling.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--faint)", padding: "9px 0" }}>해당 없음</div>
            ) : (
              selling.map((s, i) => <NetRow key={s.name} item={s} direction="sell" rank={i + 1} />)
            )}
          </div>
        </div>
      )}
    </section>
  );
}
