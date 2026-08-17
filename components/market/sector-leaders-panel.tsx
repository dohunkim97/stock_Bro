import Link from "next/link";
import { chgColorVar, formatChg } from "@/lib/format";
import type { SectorPerformance } from "@/lib/sector-performance";

function rankBadgeStyle(i: number, compact: boolean): React.CSSProperties {
  const size = compact ? 16 : 20;
  return {
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: compact ? 10 : 11,
    fontWeight: 700,
    fontFamily: "var(--mono)",
    background: i === 0 ? "var(--accent)" : "var(--panel2)",
    color: i === 0 ? "#0a0d13" : "var(--dim)",
  };
}

export type LeaderGroup = { title: string; items: SectorPerformance[] };

function LeaderGroupBlock({ title, items, compact }: LeaderGroup & { compact: boolean }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: compact ? 12.5 : 14, marginBottom: compact ? 8 : 12 }}>
        {title}
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: compact ? 11.5 : 12.5, color: "var(--faint)", padding: "4px 0" }}>
          오늘 집계된 데이터가 없어요
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 12 }}>
          {items.map((s, i) => (
            <div key={s.name} style={{ display: "flex", alignItems: "flex-start", gap: compact ? 8 : 10 }}>
              <span style={rankBadgeStyle(i, compact)}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: compact ? 3 : 5 }}>
                  <span style={{ fontWeight: 700, fontSize: compact ? 12 : 13.5 }}>{s.name}</span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: compact ? 11 : 12,
                      fontWeight: 600,
                      color: chgColorVar(s.avgChangePct),
                    }}
                  >
                    {formatChg(s.avgChangePct)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: compact ? 10 : 14, flexWrap: "wrap" }}>
                  {s.topStocks.map((st) => (
                    <Link
                      key={st.name}
                      href={st.code ? `/stock?code=${st.code}` : "/stock"}
                      className="hover-accent-border"
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: compact ? 11 : 12 }}
                    >
                      <span style={{ color: "var(--dim)" }}>{st.name}</span>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontWeight: 600,
                          color: chgColorVar(st.changePct),
                        }}
                      >
                        {formatChg(st.changePct)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Renders one or more ranking groups (e.g. 업종상위 + 테마상위) stacked
// inside a single bordered card, separated by a divider — used to keep
// related "오늘 뭐가 강했나" rankings visually together in the sidebar.
export function SectorLeadersPanel({
  groups,
  compact = false,
}: {
  groups: LeaderGroup[];
  compact?: boolean;
}) {
  return (
    <section
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: compact ? 12 : 14,
        padding: compact ? "12px 14px" : "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 14 : 18,
      }}
    >
      {groups.map((g, i) => (
        <div
          key={g.title}
          style={i > 0 ? { paddingTop: compact ? 14 : 18, borderTop: "1px solid var(--border)" } : undefined}
        >
          <LeaderGroupBlock title={g.title} items={g.items} compact={compact} />
        </div>
      ))}
    </section>
  );
}
