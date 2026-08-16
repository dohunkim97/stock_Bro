"use client";

import { useState } from "react";

type Tab = "report" | "chat";

function tabStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    fontWeight: 700,
    padding: "8px 18px",
    borderRadius: 9,
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent)" : "var(--panel)",
    color: active ? "#0a0d13" : "var(--dim)",
    cursor: "pointer",
  };
}

// Report is the landing view (Golgoo's standing forecast, evergreen —
// worth seeing before you've typed anything), Chat switches to the
// familiar two-column layout with a compact version of the report kept as
// a reference sidebar. All three children stay mounted the whole time —
// only visibility/width changes — so switching tabs never resets BroChat's
// in-progress conversation, re-fetches PredictionPanel's live quotes, or
// double-renders the same content.
export function BroTabs({
  reportFull,
  reportCompact,
  chat,
}: {
  reportFull: React.ReactNode;
  reportCompact: React.ReactNode;
  chat: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("report");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("report")} style={tabStyle(tab === "report")}>
          📋 리포트
        </button>
        <button onClick={() => setTab("chat")} style={tabStyle(tab === "chat")}>
          💬 대화
        </button>
      </div>

      <div style={{ display: tab === "report" ? "block" : "none" }}>{reportFull}</div>

      <div style={{ display: tab === "chat" ? "flex" : "none", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 640px", maxWidth: 820, minWidth: 0 }}>{chat}</div>
        <div style={{ flex: "1 1 320px", maxWidth: 380, minWidth: 280 }}>{reportCompact}</div>
      </div>
    </div>
  );
}
