import Link from "next/link";
import type { Watchlist } from "@/app/generated/prisma/client";
import { fetchNews, type NewsItem } from "@/lib/naver-news";
import { NewsList } from "@/components/news-list";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  overflow: "hidden",
};

export async function WatchlistNews({ items }: { items: Watchlist[] }) {
  const newsByCode = new Map<string, NewsItem[]>();
  if (items.length > 0) {
    const results = await Promise.all(items.map((w) => fetchNews(w.name, 3)));
    items.forEach((w, i) => newsByCode.set(w.code, results[i] ?? []));
  }

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
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
          네이버 뉴스 검색
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: "22px 18px", textAlign: "center", fontSize: 13, color: "var(--faint)" }}>
          아직 관심종목이 없어요. 종목 상세 페이지에서 ☆ 버튼을 눌러 추가해보세요.
        </div>
      ) : (
        items.map((w) => (
          <div key={w.code} style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
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
                }}
              >
                {w.sector ?? "관심종목"}
              </span>
              <Link href={`/stock?code=${w.code}`} style={{ fontSize: 14, fontWeight: 600 }}>
                {w.name}
              </Link>
            </div>
            <NewsList items={newsByCode.get(w.code) ?? []} emptyLabel={`${w.name} 관련 최근 뉴스가 없어요`} />
          </div>
        ))
      )}
    </section>
  );
}
