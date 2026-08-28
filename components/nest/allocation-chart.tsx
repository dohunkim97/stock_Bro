import type { PortfolioOverview } from "@/lib/portfolio";

// SummaryBar와 같은 이유로 formatWon(억 단위 축약) 대신 정확한 원 단위를 쓴다.
function formatKRW(value: number): string {
  return `${Math.round(value).toLocaleString()}원`;
}

const CATEGORY_COLOR: Record<string, string> = {
  stock: "#3b82f6", // 파랑 — 이 도넛은 "종류별 비중" 시각화라 상승/하락(--up/--down) 색 규칙과는 무관
  bond: "#22c55e",
  alt: "#f2c94c",
  cash: "#f2434f",
};

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 20,
};

const R = 70;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * R;

// 자산 배분 도넛 — 4개 카테고리(주식/채권/대체자산/현금)의 "현재" 비중을
// 그린다. 목표 비중과의 괴리는 도넛 옆 범례에 %p 차이로 텍스트로 같이
// 보여준다(도넛 두 겹으로 목표 vs 실제를 겹쳐 그리는 건 이 카드 크기에서
// 오히려 안 읽혀서, 실제 비중은 도넛으로 · 목표 대비 차이는 숫자로 분리).
export function AllocationChart({ overview }: { overview: PortfolioOverview }) {
  let offset = 0;
  const arcs = overview.allocation.map((a) => {
    const length = (a.pct / 100) * CIRCUMFERENCE;
    const arc = { ...a, dasharray: `${length} ${CIRCUMFERENCE - length}`, dashoffset: -offset };
    offset += length;
    return arc;
  });

  return (
    <section style={panelStyle}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>자산 배분 비중</div>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: R * 2 + STROKE, height: R * 2 + STROKE, flexShrink: 0 }}>
          <svg width={R * 2 + STROKE} height={R * 2 + STROKE} viewBox={`0 0 ${R * 2 + STROKE} ${R * 2 + STROKE}`}>
            <circle cx={R + STROKE / 2} cy={R + STROKE / 2} r={R} fill="none" stroke="var(--panel2)" strokeWidth={STROKE} />
            {arcs.map((a) =>
              a.pct > 0 ? (
                <circle
                  key={a.key}
                  cx={R + STROKE / 2}
                  cy={R + STROKE / 2}
                  r={R}
                  fill="none"
                  stroke={CATEGORY_COLOR[a.key]}
                  strokeWidth={STROKE}
                  strokeDasharray={a.dasharray}
                  strokeDashoffset={a.dashoffset}
                  transform={`rotate(-90 ${R + STROKE / 2} ${R + STROKE / 2})`}
                  strokeLinecap="butt"
                />
              ) : null
            )}
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, color: "var(--faint)" }}>총 운용자산</div>
            <div style={{ fontSize: 11, fontWeight: 800, fontFamily: "var(--mono)", padding: "0 6px", lineHeight: 1.3 }}>
              {formatKRW(overview.totalValuation)}
            </div>
            <div style={{ fontSize: 10, color: "var(--faint)" }}>{overview.allocation.filter((a) => a.amount > 0).length} Categories</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, minWidth: 200 }}>
          {overview.allocation.map((a) => {
            const diff = a.pct - a.targetPct;
            return (
              <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: CATEGORY_COLOR[a.key], flexShrink: 0 }} />
                <span style={{ color: "var(--text)", flexShrink: 0 }}>{a.label}</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{a.pct.toFixed(1)}%</span>
                <span style={{ fontSize: 10.5, color: "var(--faint)", marginLeft: "auto" }}>
                  목표 {a.targetPct.toFixed(0)}%
                  {Math.abs(diff) >= 0.5 && (
                    <span style={{ color: diff > 0 ? "var(--up)" : "var(--down)", marginLeft: 4 }}>
                      ({diff > 0 ? "+" : ""}
                      {diff.toFixed(1)}%p)
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
