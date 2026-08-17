import { formatWon } from "@/lib/format";
import { weekdayLabel } from "@/lib/dates";
import type { ThemeMoneyFlowByDay } from "@/lib/money-flow";

function formatDayHeader(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}/${d}(${weekdayLabel(iso)})`;
}

function cell(value: number): string {
  return value > 0 ? formatWon(value) : "-";
}

export function MoneyFlowPanel({
  days,
  themes,
}: {
  days: string[];
  themes: ThemeMoneyFlowByDay[];
}) {
  const cols = `1.2fr repeat(${days.length}, 1fr) 1.1fr`;

  return (
    <section
      style={{
        background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
        border: "1px solid var(--border2)",
        borderRadius: 16,
        padding: 22,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>🔥 시장 관심 상위 테마</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>
          최근 {days.length}거래일 · 일별 거래대금
        </span>
      </div>

      {themes.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "var(--dim)" }}>
          최근 거래일에는 테마가 태깅된 종목의 거래대금 데이터가 아직 없어요.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, minWidth: 74 * (days.length + 2.3), fontFamily: "var(--mono)" }}>
            <div style={{ fontSize: 11, color: "var(--faint)", padding: "0 0 10px" }} />
            {days.map((d) => (
              <div key={d} style={{ fontSize: 11, color: "var(--faint)", textAlign: "right", padding: "0 0 10px" }}>
                {formatDayHeader(d)}
              </div>
            ))}
            <div style={{ fontSize: 11, color: "var(--accent)", textAlign: "right", padding: "0 0 10px" }}>
              누적
            </div>

            {themes.map((t, i) => (
              <ThemeRow key={t.name} theme={t} rank={i} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ThemeRow({ theme, rank }: { theme: ThemeMoneyFlowByDay; rank: number }) {
  return (
    <>
      <div
        style={{
          fontFamily: "var(--sans)",
          fontSize: 13,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 0",
          borderTop: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            background: rank === 0 ? "var(--accent)" : "var(--panel2)",
            color: rank === 0 ? "#0a0d13" : "var(--dim)",
          }}
        >
          {rank + 1}
        </span>
        {theme.name}
      </div>
      {theme.dailyTotals.map((v, i) => (
        <div
          key={i}
          style={{
            fontSize: 10.5,
            whiteSpace: "nowrap",
            textAlign: "right",
            padding: "10px 0",
            borderTop: "1px solid var(--border)",
            color: v > 0 ? "var(--text)" : "var(--faint)",
          }}
        >
          {cell(v)}
        </div>
      ))}
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          whiteSpace: "nowrap",
          textAlign: "right",
          padding: "10px 0",
          borderTop: "1px solid var(--border)",
          color: "var(--accent)",
        }}
      >
        {formatWon(theme.cumulativeTotal)}
      </div>
    </>
  );
}
