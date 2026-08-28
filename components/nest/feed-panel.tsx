"use client";

import { useMemo, useState } from "react";
import type { FeedItem } from "@/lib/portfolio-feed";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxHeight: 640,
};

function formatPubDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// 보유 종목 실시간 인텔리전스 피드 — 상단 필터 칩("전체" + 종목별)으로
// lib/portfolio-feed.ts가 미리 가져온 뉴스+텔레그램 아이템을 클라이언트에서
// 걸러 보여준다. NewsList를 그대로 재사용하지 않는 이유는, 같은 기사가
// 여러 보유 종목에 동시에 매칭되면 link가 중복돼 NewsList의 key(=link) 전제가
// 깨지기 때문 — 여기서는 kind+link+stockName으로 키를 만든다.
export function FeedPanel({ items, holdingNames }: { items: FeedItem[]; holdingNames: string[] }) {
  const [filter, setFilter] = useState<string>("전체");

  const filtered = useMemo(
    () => (filter === "전체" ? items : items.filter((i) => i.stockName === filter)),
    [items, filter]
  );

  return (
    <section style={panelStyle}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>보유 종목 실시간 인텔리전스</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {["전체", ...holdingNames].map((name) => (
          <button
            key={name}
            onClick={() => setFilter(name)}
            style={{
              border: "1px solid var(--border)",
              background: filter === name ? "var(--accent)" : "var(--panel2)",
              color: filter === name ? "#0a0d13" : "var(--dim)",
              fontWeight: 600,
              fontSize: 11,
              padding: "5px 11px",
              borderRadius: 20,
              cursor: "pointer",
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "20px 0", fontSize: 12.5, color: "var(--faint)", textAlign: "center" }}>
            {holdingNames.length === 0 ? "보유 종목을 추가하면 관련 소식이 여기 모여요." : "관련 소식이 아직 없어요."}
          </div>
        ) : (
          filtered.map((item) => (
            <a
              key={`${item.kind}-${item.link}-${item.stockName}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="hover-row"
              style={{
                display: "flex",
                gap: 10,
                padding: "12px 0",
                borderTop: "1px solid var(--border)",
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)", width: 40, flexShrink: 0, paddingTop: 2 }}>
                {formatPubDate(item.pubDate)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--accent)",
                      background: "var(--accent-soft)",
                      borderRadius: 5,
                      padding: "1px 6px",
                      flexShrink: 0,
                    }}
                  >
                    {item.stockName}
                  </span>
                  {item.kind === "telegram" && (
                    <span style={{ fontSize: 10, color: "var(--faint)" }}>텔레그램</span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{item.source || "뉴스"}</div>
              </div>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
