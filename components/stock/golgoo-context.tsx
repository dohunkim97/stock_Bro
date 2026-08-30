"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { TechnicalSignal, SupportResistanceLevel } from "@/lib/technical-signals";

// Shared toggle state between GolgooEvidenceButton (in the title row, next
// to WatchlistButton) and both GolgooPanel (side panel) and PriceChart
// (chart overlay) — they're siblings scattered across app/stock/page.tsx,
// so a tiny context is simpler than prop-drilling a callback through the
// whole page. GolgooPanel does the actual data fetch and publishes
// signals/levels here once loaded; PriceChart only reads them.
type GolgooCtxValue = {
  available: boolean;
  open: boolean;
  toggle: () => void;
  signals: TechnicalSignal[] | null;
  levels: SupportResistanceLevel[] | null;
  setOverlay: (signals: TechnicalSignal[], levels: SupportResistanceLevel[]) => void;
};

const GolgooContext = createContext<GolgooCtxValue | null>(null);

export function GolgooProvider({
  available,
  children,
}: {
  available: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState<TechnicalSignal[] | null>(null);
  const [levels, setLevels] = useState<SupportResistanceLevel[] | null>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const setOverlay = useCallback((s: TechnicalSignal[], l: SupportResistanceLevel[]) => {
    setSignals(s);
    setLevels(l);
  }, []);

  return (
    <GolgooContext.Provider value={{ available, open, toggle, signals, levels, setOverlay }}>
      {children}
    </GolgooContext.Provider>
  );
}

export function useGolgoo(): GolgooCtxValue {
  const ctx = useContext(GolgooContext);
  if (!ctx) throw new Error("useGolgoo must be used within a GolgooProvider");
  return ctx;
}
