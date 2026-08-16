"use client";

import { useCallback, useRef, useState } from "react";

const DEFAULT_CHAT_PCT = 30; // report:chat = 7:3 by default
const MIN_CHAT_PCT = 20;
const MAX_CHAT_PCT = 55;

// A single always-on 7:3 report:chat split — no tab switching, both panes
// visible from the moment the page loads. The divider between them is
// draggable (pointer capture, no window-level listeners needed) so the
// ratio isn't fixed.
export function BroSplit({ report, chat }: { report: React.ReactNode; chat: React.ReactNode }) {
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
    <div ref={containerRef} style={{ display: "flex", alignItems: "flex-start" }}>
      <div style={{ flex: `0 0 ${100 - chatPct}%`, minWidth: 0, paddingRight: 12 }}>{report}</div>

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
  );
}
