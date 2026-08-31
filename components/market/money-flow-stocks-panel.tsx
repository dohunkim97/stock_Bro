import Link from "next/link";
import { chgColorVar, formatChg } from "@/lib/format";
import { RankBadge } from "./rank-badge";
import type { ThemeStockGroups, MoneyFlowStock } from "@/lib/money-flow";

function StockChips({ stocks }: { stocks: MoneyFlowStock[] }) {
  if (stocks.length === 0) return <span style={{ color: "var(--faint)" }}>-</span>;
  return (
    <>
      {stocks.map((s, i) => (
        <span key={s.name}>
          <Link
            href={s.code ? `/stock?code=${s.code}` : "/stock"}
            className="hover-accent-border"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span style={{ color: "var(--text)" }}>{s.name}</span>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: chgColorVar(s.changePct) }}>
              {formatChg(s.changePct)}
            </span>
          </Link>
          {i < stocks.length - 1 && <span style={{ color: "var(--faint)", margin: "0 4px" }}>·</span>}
        </span>
      ))}
    </>
  );
}

// 대표기업/관련 중소형주를 한 줄에 같이 넣어 테마당 1행으로 압축 — 짝을 이루는
// MoneyFlowPanel과 헤더 행(같은 fontSize:11/padding) + 데이터 행(같은
// padding:"10px 0") 스타일을 그대로 맞춰서, 두 패널의 순위별 줄이 서로
// 정확히 나란히 오도록 했다.
export function MoneyFlowStocksPanel({ themes }: { themes: ThemeStockGroups[] }) {
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
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>🏢 테마별 종목</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>대표기업 · 관련 중소형주</span>
      </div>

      {themes.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "var(--dim)" }}>표시할 테마가 아직 없어요.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px max-content max-content", columnGap: 20, fontSize: 12, width: "max-content", fontFamily: "var(--mono)" }}>
            {/* MoneyFlowPanel의 헤더 행(빈 칸 + 날짜들 + 누적)과 같은 스타일로 맞춰서
                — 이 헤더 행 높이가 그 패널과 같아야 아래 테마 행들이 서로 줄이 맞는다. */}
            <div style={{ fontSize: 11, color: "var(--faint)", padding: "0 0 10px" }} />
            <div style={{ fontSize: 11, color: "var(--faint)", padding: "0 0 10px" }}>대표기업</div>
            <div style={{ fontSize: 11, color: "var(--faint)", padding: "0 0 10px" }}>관련 중소형주</div>

            {themes.map((t, i) => (
              <div key={t.name} style={{ display: "contents" }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: "var(--sans)",
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "10px 0",
                    borderTop: "1px solid var(--border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <RankBadge rank={i + 1} />
                  {t.name}
                </span>
                <span style={{ padding: "10px 0", borderTop: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                  <StockChips stocks={t.leaders} />
                </span>
                <span style={{ padding: "10px 0", borderTop: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                  <StockChips stocks={t.followers} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 }}>
        대표기업은 테마 내 시가총액 상위, 관련 중소형주는 시가총액 하위 종목이에요 — 관련 중소형주가
        실제로 따라 오른다는 예측이 아니라 참고용 목록이에요.
      </div>
    </section>
  );
}
