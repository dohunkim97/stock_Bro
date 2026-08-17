"use client";

import { useCallback, useRef, useState } from "react";

const DEFAULT_END_PCT = 50;
const MIN_END_PCT = 25;
const MAX_END_PCT = 75;

type SplitPaneProps = {
  /** "row" = panes side by side, drag a vertical bar left/right to resize width.
   *  "column" = panes stacked, drag a horizontal bar up/down to resize height. */
  direction: "row" | "column";
  start: React.ReactNode;
  end: React.ReactNode;
  defaultEndPct?: number;
  minEndPct?: number;
  maxEndPct?: number;
};

// Draggable two-pane divider, reused for both inner splits on /bro:
// 리포트|대화창 (direction="row") and 예상종목/기록보관소 (direction="column").
// The outer left:right column layout in app/bro/page.tsx is a fixed 50:50
// (not draggable) — only these two inner splits move, each independently.
export function SplitPane({
  direction,
  start,
  end,
  defaultEndPct = DEFAULT_END_PCT,
  minEndPct = MIN_END_PCT,
  maxEndPct = MAX_END_PCT,
}: SplitPaneProps) {
  const [endPct, setEndPct] = useState(defaultEndPct);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const isRow = direction === "row";

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // "end" pane's size is measured back from the container's trailing
      // edge (right for row, bottom for column) to the cursor — mirrors the
      // original single left:right split's math, generalized to either axis.
      const pct = isRow
        ? ((rect.right - e.clientX) / rect.width) * 100
        : ((rect.bottom - e.clientY) / rect.height) * 100;
      setEndPct(Math.min(maxEndPct, Math.max(minEndPct, pct)));
    },
    [isRow, minEndPct, maxEndPct]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: isRow ? "row" : "column",
        alignItems: "stretch",
        height: "100%",
      }}
    >
      <div
        style={{
          flex: `0 0 ${100 - endPct}%`,
          minWidth: 0,
          minHeight: 0,
          overflow: "auto",
          [isRow ? "paddingRight" : "paddingBottom"]: 12,
        }}
      >
        {start}
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="드래그해서 비율 조정"
        style={{
          flexShrink: 0,
          width: isRow ? 10 : "100%",
          height: isRow ? "auto" : 10,
          alignSelf: "stretch",
          cursor: isRow ? "col-resize" : "row-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "none",
        }}
      >
        <div
          style={
            isRow
              ? { width: 4, height: 44, borderRadius: 3, background: "var(--border2)" }
              : { height: 4, width: 44, borderRadius: 3, background: "var(--border2)" }
          }
        />
      </div>

      <div
        style={{
          flex: `0 0 ${endPct}%`,
          minWidth: 0,
          minHeight: 0,
          overflow: "auto",
          [isRow ? "paddingLeft" : "paddingTop"]: 12,
        }}
      >
        {end}
      </div>
    </div>
  );
}
