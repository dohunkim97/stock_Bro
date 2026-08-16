"use client";

import { useCallback, useRef, useState } from "react";

const DEFAULT_RIGHT_PCT = 50; // half-half by default
const MIN_RIGHT_PCT = 25;
const MAX_RIGHT_PCT = 75;

// A single always-on left:right split (50:50 by default) — no tab
// switching, both sides visible from the moment the page loads. The
// divider between them is draggable (pointer capture, no window-level
// listeners needed) so the ratio isn't fixed.
export function BroSplit({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const [rightPct, setRightPct] = useState(DEFAULT_RIGHT_PCT);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // Right pane's width is measured from the container's right edge back
    // to the cursor.
    const pct = ((rect.right - e.clientX) / rect.width) * 100;
    setRightPct(Math.min(MAX_RIGHT_PCT, Math.max(MIN_RIGHT_PCT, pct)));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  return (
    <div ref={containerRef} style={{ display: "flex", alignItems: "flex-start" }}>
      <div style={{ flex: `0 0 ${100 - rightPct}%`, minWidth: 0, paddingRight: 12 }}>{left}</div>

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

      <div style={{ flex: `0 0 ${rightPct}%`, minWidth: 0, paddingLeft: 12 }}>{right}</div>
    </div>
  );
}
