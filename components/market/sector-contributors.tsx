"use client";

import Link from "next/link";
import { useState } from "react";
import { chgColorVar, formatChg } from "@/lib/format";
import type { SectorEntry } from "@/lib/sector-aggregation";

const DEFAULT_COUNT = 10;

export function SectorContributors({
  hotSector,
  contributors,
}: {
  hotSector: string;
  contributors: SectorEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? contributors : contributors.slice(0, DEFAULT_COUNT);

  return (
    <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 24 }}>
      <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 12, fontFamily: "var(--mono)" }}>
        {hotSector} 섹터 기여 종목
      </div>

      {visible.map((s) => (
        <Link
          key={s.name}
          href={s.code ? `/stock?code=${s.code}` : "/stock"}
          className="hover-accent-border"
          style={{
            width: "100%",
            textAlign: "left",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "11px 13px",
            marginBottom: 7,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
              {s.code ?? "-"}
            </span>
          </span>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, color: chgColorVar(s.changePct) }}>
            {formatChg(s.changePct)}
          </span>
        </Link>
      ))}

      {contributors.length > DEFAULT_COUNT && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 7,
            background: "var(--panel2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--dim)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {expanded ? "접기" : `더보기 (전체 ${contributors.length}종목)`}
        </button>
      )}

      <Link
        href={contributors[0]?.code ? `/stock?code=${contributors[0].code}` : "/stock"}
        style={{
          display: "block",
          width: "100%",
          marginTop: 6,
          padding: 11,
          background: "var(--accent)",
          color: "#0a0d13",
          border: "none",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 13.5,
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        {contributors[0]?.name ?? hotSector} 상세 분석 보기 →
      </Link>
    </div>
  );
}
