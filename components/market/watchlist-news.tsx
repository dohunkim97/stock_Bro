import Link from "next/link";
import type { Watchlist } from "@/app/generated/prisma/client";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  overflow: "hidden",
};

// Real news isn't wired in yet (no news API configured) — this mirrors the
// same "실시간 연동 예정" placeholder pattern already used on the stock
// detail page's news section, just scoped to the user's watchlist so the
// layout is ready to swap in a real feed later.
export function WatchlistNews({ items }: { items: Watchlist[] }) {
  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "16px 18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>관심종목 뉴스</span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--down)",
            border: "1px solid var(--down)",
            padding: "1px 6px",
            borderRadius: 5,
          }}
        >
          실시간 연동 예정
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: "22px 18px", textAlign: "center", fontSize: 13, color: "var(--faint)" }}>
          아직 관심종목이 없어요. 종목 상세 페이지에서 ☆ 버튼을 눌러 추가해보세요.
        </div>
      ) : (
        items.map((w) => (
          <div
            key={w.code}
            style={{
              display: "flex",
              gap: 14,
              padding: "13px 18px",
              borderBottom: "1px solid var(--border)",
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
                fontSize: 10.5,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 5,
                flexShrink: 0,
                whiteSpace: "nowrap",
                marginTop: 2,
              }}
            >
              {w.sector ?? "관심종목"}
            </span>
            <div style={{ flex: 1 }}>
              <Link href={`/stock?code=${w.code}`} style={{ fontSize: 14, fontWeight: 500 }}>
                {w.name}
              </Link>
              <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 3 }}>
                관련 뉴스 연동 준비 중이에요 · {w.market ?? ""}
              </div>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
