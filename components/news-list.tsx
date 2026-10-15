import type { NewsItem } from "@/lib/naver-news";
import { kstDateParts } from "@/lib/dates";

// Shared renderer for real Naver News results — used on the stock detail
// page, the watchlist news panel, and the mentioned-stock detail preview.
// Links open the original article; no summarization happens here (that
// needs an LLM we don't have wired in yet).

function formatPubDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // This renders during SSR too (no "use client" here), so the server's
  // UTC clock — not the viewer's KST one — would read a pre-09:00 KST
  // article as the previous day without the explicit Asia/Seoul lookup.
  const { month, day } = kstDateParts(d);
  return `${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
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
