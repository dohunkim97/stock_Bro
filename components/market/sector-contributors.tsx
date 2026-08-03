"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { chgColorVar, formatChg } from "@/lib/format";
import type { SectorEntry } from "@/lib/sector-aggregation";

const TOP_N = 3;

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "7px 0",
  fontSize: 12.5,
};

const modalRowStyle: React.CSSProperties = {
  ...rowStyle,
  padding: "10px 12px",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 8,
};

// Real classified stocks for the week's aggregated hot sector (agg.contributors
// from lib/sector-aggregation.ts) — not stock names parsed out of the AI's
// prose, which wouldn't reliably match anything. Shown inside the AI
// briefing's sector/theme box since that's the sector it's describing.
export function SectorContributors({
  contributors,
  sectorLabel,
}: {
  contributors: SectorEntry[];
  sectorLabel: string;
}) {
  const [open, setOpen] = useState(false);
  if (contributors.length === 0) return null;
  const top = contributors.slice(0, TOP_N);

  return (
    <>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {top.map((c) => (
            <Link key={c.name} href={c.code ? `/stock?code=${c.code}` : "/stock"} className="hover-accent-border" style={rowStyle}>
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{c.name}</span>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: chgColorVar(c.changePct) }}>
                {formatChg(c.changePct)}
              </span>
            </Link>
          ))}
        </div>
        {contributors.length > TOP_N && (
          <button
            onClick={() => setOpen(true)}
            style={{
              marginTop: 6,
              background: "none",
              border: "none",
              color: "var(--accent)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              padding: 0,
            }}
          >
            더보기 (전체 {contributors.length}종목) →
          </button>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`${sectorLabel} · 전체 ${contributors.length}종목`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {contributors.map((c) => (
            <Link key={c.name} href={c.code ? `/stock?code=${c.code}` : "/stock"} className="hover-accent-border" style={modalRowStyle}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: chgColorVar(c.changePct) }}>
                {formatChg(c.changePct)}
              </span>
            </Link>
          ))}
        </div>
      </Modal>
    </>
  );
}
