import Link from "next/link";
import { formatDateLabel, nextBusinessDay, prevBusinessDay } from "@/lib/dates";

const PERIOD_TABS = [
  { key: "day", label: "일간" },
  { key: "week", label: "주간 리포트" },
  { key: "month", label: "월간 리포트" },
];

function periodSubLabel(period: string) {
  if (period === "day") return "일간 데이터";
  if (period === "week") return "주간 리포트 · 06.30~07.06";
  return "월간 리포트 · 2026.06";
}

export function PeriodDateNav({
  period,
  date,
  sectorWeek,
}: {
  period: string;
  date: string;
  sectorWeek: string;
}) {
  const weekParam = `&sectorWeek=${sectorWeek}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 14,
        marginBottom: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link
          href={`/market?period=${period}&date=${prevBusinessDay(date)}${weekParam}`}
          style={navBtnStyle}
        >
          ‹
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "8px 14px",
          }}
        >
          <span style={{ fontSize: 15 }}>📅</span>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 14 }}>
            {formatDateLabel(date)}
          </span>
        </div>
        <Link
          href={`/market?period=${period}&date=${nextBusinessDay(date)}${weekParam}`}
          style={navBtnStyle}
        >
          ›
        </Link>
        <span style={{ fontSize: 12, color: "var(--faint)", marginLeft: 4 }}>
          {periodSubLabel(period)}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 2,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 3,
        }}
      >
        {PERIOD_TABS.map((p) => {
          const active = p.key === period;
          return (
            <Link key={p.key} href={`/market?period=${p.key}&date=${date}${weekParam}`}>
              <button
                style={{
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--sans)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "7px 16px",
                  borderRadius: 7,
                  whiteSpace: "nowrap",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#0a0d13" : "var(--dim)",
                }}
              >
                {p.label}
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--panel)",
  color: "var(--dim)",
  fontSize: 15,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
