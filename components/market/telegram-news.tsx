import { getRecentTelegramNews } from "@/lib/telegram-news";
import { NewsList } from "@/components/news-list";
import type { NewsItem } from "@/lib/naver-news";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  overflow: "hidden",
};

// Just a title for the list row — full text still lives in the DB, but
// NewsList only ever renders the title/source/date, matching how the
// Naver-sourced lists work.
function toTitle(text: string): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

export async function TelegramNewsPanel() {
  const rows = await getRecentTelegramNews(10);
  const items: NewsItem[] = rows.map((r) => ({
    title: toTitle(r.text),
    link: r.link ?? "",
    description: r.text,
    pubDate: r.createdAt.toISOString(),
    source: r.sourceName ? `텔레그램 · ${r.sourceName}` : "텔레그램 제보",
  }));

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
        <span style={{ fontWeight: 700, fontSize: 15 }}>텔레그램 제보</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
          직접 전달한 기사
        </span>
      </div>
      <div style={{ padding: "0 18px" }}>
        <NewsList items={items} emptyLabel="아직 전달된 기사가 없어요. 텔레그램 봇에게 기사를 전달(forward)해보세요." />
      </div>
    </section>
  );
}
