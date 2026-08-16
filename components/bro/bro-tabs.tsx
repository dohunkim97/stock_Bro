"use client";

import { useCallback, useRef, useState } from "react";

type Tab = "report" | "chat";

const DEFAULT_CHAT_PCT = 30; // report:chat = 7:3 by default
const MIN_CHAT_PCT = 20;
const MAX_CHAT_PCT = 55;

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
// worth seeing before you've typed anything). Clicking 대화 pushes it aside
// into a 7:3 report:chat split, draggable via the handle between them. All
// three children stay mounted the whole time — only visibility/width
// changes — so switching tabs never resets BroChat's in-progress
// conversation, re-fetches PredictionPanel's live quotes, or
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
  const [chatPct, setChatPct] = useState(DEFAULT_CHAT_PCT);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // Chat pane sits on the right, so its width is measured from the
    // container's right edge back to the cursor.
    const pct = ((rect.right - e.clientX) / rect.width) * 100;
    setChatPct(Math.min(MAX_CHAT_PCT, Math.max(MIN_CHAT_PCT, pct)));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

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

      <div ref={containerRef} style={{ display: tab === "chat" ? "flex" : "none", alignItems: "flex-start" }}>
        <div style={{ flex: `0 0 ${100 - chatPct}%`, minWidth: 0, paddingRight: 12 }}>{reportCompact}</div>

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title="드래그해서 비율 조정"
          style={{
            flexShrink: 0,
            width: 10,
            alignSelf: "stretch",
            cursor: "col-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            touchAction: "none",
          }}
        >
          <div style={{ width: 4, height: 44, borderRadius: 3, background: "var(--border2)" }} />
        </div>

        <div style={{ flex: `0 0 ${chatPct}%`, minWidth: 0, paddingLeft: 12 }}>{chat}</div>
      </div>
    </div>
  );
}
