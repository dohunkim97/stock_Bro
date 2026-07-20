import type { NewsItem } from "@/lib/naver-news";

// Shared renderer for real Naver News results — used on the stock detail
// page, the watchlist news panel, and the mentioned-stock detail preview.
// Links open the original article; no summarization happens here (that
// needs an LLM we don't have wired in yet).

function formatPubDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}.${day}`;
}

export function NewsList({ items, emptyLabel }: { items: NewsItem[]; emptyLabel: string }) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "16px 0", fontSize: 13, color: "var(--faint)" }}>{emptyLabel}</div>
    );
  }

  return (
    <>
      {items.map((n) => (
        <a
          key={n.link}
          href={n.link}
          target="_blank"
          rel="noopener noreferrer"
          className="hover-row"
          style={{
            display: "flex",
            gap: 14,
            padding: "13px 0",
            borderTop: "1px solid var(--border)",
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--faint)",
              width: 44,
              flexShrink: 0,
              paddingTop: 2,
            }}
          >
            {formatPubDate(n.pubDate)}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>{n.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 3 }}>
              {n.source || "뉴스"}
            </div>
          </div>
        </a>
      ))}
    </>
  );
}
