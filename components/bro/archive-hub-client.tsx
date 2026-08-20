"use client";

import { useState } from "react";

export type ArchiveRow = {
  key: string;
  date: string;
  summary: string;
  meta?: string;
  detail: React.ReactNode;
};

type TabKey = "predictions" | "daily" | "chat";

const TABS: { key: TabKey; label: string }[] = [
  { key: "predictions", label: "예상리포트" },
  { key: "daily", label: "일간리포트" },
  { key: "chat", label: "대화기록" },
];

const EMPTY_MESSAGE: Record<TabKey, string> = {
  predictions: "아직 채점된 지난 주가 없어요 — 한 주가 끝나면 여기 쌓이기 시작해요.",
  daily: "아직 쌓인 일간 리포트가 없어요.",
  chat: "아직 Golgoo와 나눈 대화 기록이 없어요.",
};

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 18,
  height: "100%",
  overflowY: "auto",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 11.5,
    fontWeight: 700,
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent)" : "var(--panel2)",
    color: active ? "#0a0d13" : "var(--dim)",
    cursor: "pointer",
  };
}

// 기록보관소 — one shared shell for three archives (예상리포트/일간리포트/
// 대화기록) that all read the same way: a flat date|요약 row you click to
// expand into the full detail. Data for all three tabs is fetched once
// server-side (see ArchiveHub) and handed in as pre-rendered rows — this
// component only owns which tab is showing, so switching tabs is instant
// and never re-fetches.
export function ArchiveHubClient({
  predictions,
  dailyReports,
  chats,
}: {
  predictions: ArchiveRow[];
  dailyReports: ArchiveRow[];
  chats: ArchiveRow[];
}) {
  const [tab, setTab] = useState<TabKey>("predictions");
  const rows = tab === "predictions" ? predictions : tab === "daily" ? dailyReports : chats;

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>🗄️ 기록보관소</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>{EMPTY_MESSAGE[tab]}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r) => (
            <details key={r.key} className="no-marker">
              <summary style={{ cursor: "pointer", display: "flex", gap: 6, alignItems: "stretch" }}>
                <div
                  style={{
                    flex: "0 0 84px",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "8px 9px",
                    background: "var(--panel2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: "var(--mono)",
                    color: "var(--text)",
                  }}
                >
                  <span className="chevron" style={{ fontSize: 8, color: "var(--faint)", flexShrink: 0 }}>
                    ▶
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.date}</span>
                </div>
                <div
                  title={r.summary}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "8px 11px",
                    background: "var(--panel2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11.5,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.summary || "-"}
                  {r.meta && <span style={{ color: "var(--faint)", marginLeft: 8, fontSize: 10 }}>· {r.meta}</span>}
                </div>
              </summary>
              <div style={{ padding: "10px 4px 4px", marginLeft: 90 }}>{r.detail}</div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
