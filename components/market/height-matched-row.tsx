"use client";

import { useEffect, useRef, useState } from "react";

// CSS alone can't cap `left`'s height to `right`'s natural content height —
// flex/grid stretch only ever grows the SHORTER side to match the taller
// one, never shrinks the taller one down. TOP종목's row list is naturally
// much taller than 업종상위+테마상위+AI 브리핑, so matching them requires
// actually measuring `right`'s rendered height and applying it as a cap on
// `left`, which only a client component can do. `left`'s own content (see
// StockTable) still handles the internal scrolling once its height is capped
// here — this component only supplies the number to cap it at.
export function HeightMatchedRow({
  left,
  right,
  leftFlex = 1,
  rightFlex = 1.15,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  leftFlex?: number;
  rightFlex?: number;
}) {
  const rightRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div style={{ flex: `${leftFlex} 1 0%`, minWidth: 0, height, overflow: "hidden" }}>{left}</div>
      <div ref={rightRef} style={{ flex: `${rightFlex} 1 0%`, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {right}
      </div>
    </div>
  );
}
