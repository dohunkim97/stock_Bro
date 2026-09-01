import Link from "next/link";
import { formatWon } from "@/lib/format";
import { RankBadge } from "./rank-badge";
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

// ThemeNetFlowPanel과 반드시 같은 값 — 위 파일 헤더 설명 참고.
const ROW_HEIGHT = 36;

function ThemeRow({ item, rank }: { item: ThemeNetRank; rank: number }) {
  return (
    // overflow:hidden은 안전장치다 — 아래 종목 칩 스크롤 영역이 스크롤바
    // 두께만큼 살짝 더 필요해지는 행이 생겨도, 행 높이 자체는 항상
    // ROW_HEIGHT로 못박아서 그 행 하나 때문에 아래 순위들이 밀리지 않게 한다.
    <div style={{ height: ROW_HEIGHT, overflow: "hidden", borderTop: "1px solid var(--border)", fontSize: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: "100%", minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13, flexShrink: 0, whiteSpace: "nowrap" }}>
          <RankBadge rank={rank} />
          {item.name}
        </span>
        <div className="thin-scrollbar" style={{ overflowX: "auto", minWidth: 0 }}>
          <StockChips stocks={item.stocks} />
        </div>
      </div>
    </div>
  );
}

// ThemeNetFlowPanel과 같은 순매수/순매도 2열 구조 — 짝을 이루는 그 패널과 행
// 수·행 높이를 맞춘다. 그 패널엔 제목 밑에 2줄짜리 설명 문단이 있어서, 여기도
// 똑같은 자리에 안 보이는(aria-hidden) 복사본을 넣어 높이를 정확히 맞춘 뒤에
// "▲ 순매수 상위" 줄부터 시작하게 했다 — 서로 다른 문구로 대충 맞추면 폰트
// 렌더링 차이로 줄이 미묘하게 어긋날 수 있어서, 아예 같은 문구를 복사했다.
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
      {/* marginBottom: 6은 ThemeNetFlowPanel의 제목 줄과 반드시 같아야 한다 —
          여기만 16이었더니 그 10px 차이가 그대로 누적돼서 두 패널의 "1위" 줄이
          시작부터 어긋나 있었다. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>🏢 순매수·순매도 테마별 종목</span>
      </div>
      <div aria-hidden style={{ visibility: "hidden", fontSize: 11.5, marginBottom: 16, lineHeight: 1.5, maxWidth: 560 }}>
        테마에 태깅된 종목들의 외국인+기관 순매수 거래대금을 다 더한 값이에요. 거래가 활발한 것(위쪽
        &quot;시장 관심 상위 테마&quot;)과는 다른 지표로, 사는 쪽이 우세한지 파는 쪽이 우세한지를 봐요.
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
              buying.map((b, i) => <ThemeRow key={b.name} item={b} rank={i + 1} />)
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--down)", marginBottom: 4 }}>▼ 순매도 상위</div>
            {selling.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--faint)", padding: "9px 0" }}>해당 없음</div>
            ) : (
              selling.map((s, i) => <ThemeRow key={s.name} item={s} rank={i + 1} />)
            )}
          </div>
        </div>
      )}
    </section>
  );
}
