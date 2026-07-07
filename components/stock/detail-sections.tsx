import {
  chartPoints,
  chartRanges,
  valuation,
  financials,
  revenueMix,
  news,
  competitors,
} from "@/lib/stock-detail-sample";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "18px 20px",
};

export function DetailSections() {
  const areaPoints = `${chartPoints} 620,220 0,220`;
  const conicStops = revenueMix.reduce((acc, r) => {
    const start = acc.offset;
    const end = start + r.pct;
    acc.parts.push(`${r.color} ${start}% ${end}%`);
    acc.offset = end;
    return acc;
  }, { offset: 0, parts: [] as string[] }).parts.join(", ");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 20, alignItems: "start" }}>
      {/* 차트 */}
      <section style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>주가 추이</span>
          <div style={{ display: "flex", gap: 4, fontFamily: "var(--mono)", fontSize: 11.5 }}>
            {chartRanges.map((r) => (
              <span
                key={r.label}
                style={{
                  padding: "4px 9px",
                  borderRadius: 6,
                  background: r.active ? "var(--accent)" : "transparent",
                  color: r.active ? "#0a0d13" : "var(--faint)",
                  cursor: "pointer",
                }}
              >
                {r.label}
              </span>
            ))}
          </div>
        </div>
        <svg viewBox="0 0 620 220" preserveAspectRatio="none" style={{ width: "100%", height: 220, display: "block" }}>
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--up)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--up)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <line x1="0" y1="55" x2="620" y2="55" stroke="var(--border)" strokeWidth={1} />
          <line x1="0" y1="110" x2="620" y2="110" stroke="var(--border)" strokeWidth={1} />
          <line x1="0" y1="165" x2="620" y2="165" stroke="var(--border)" strokeWidth={1} />
          <polygon points={areaPoints} fill="url(#area)" />
          <polyline
            points={chartPoints}
            fill="none"
            stroke="var(--up)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={620} cy={30} r={4} fill="var(--up)" />
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)", marginTop: 6 }}>
          <span>04.07</span><span>05.06</span><span>06.05</span><span>07.06</span>
        </div>
      </section>

      {/* 밸류에이션 */}
      <section style={panelStyle}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>밸류에이션</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginTop: 15 }}>
          {valuation.map((v) => (
            <div key={v.label} style={{ background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 11, padding: "13px 14px" }}>
              <div style={{ fontSize: 11.5, color: "var(--dim)", marginBottom: 6 }}>{v.label}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 19, fontWeight: 700 }}>{v.value}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)", marginTop: 3 }}>{v.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 핵심 재무 */}
      <section style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>
            핵심 재무{" "}
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", fontWeight: 400 }}>
              (억원, 연간)
            </span>
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr repeat(3,1fr)", gap: 0, fontFamily: "var(--mono)" }}>
          <div style={{ fontSize: 11, color: "var(--faint)", padding: "0 0 10px" }} />
          <div style={{ fontSize: 11.5, color: "var(--dim)", textAlign: "right", padding: "0 0 10px" }}>2023</div>
          <div style={{ fontSize: 11.5, color: "var(--dim)", textAlign: "right", padding: "0 0 10px" }}>2024</div>
          <div style={{ fontSize: 11.5, color: "var(--accent)", textAlign: "right", padding: "0 0 10px" }}>2025E</div>
          {financials.map((f) => (
            <FinancialRow key={f.label} f={f} />
          ))}
        </div>
      </section>

      {/* 사업/제품별 매출 비중 */}
      <section style={panelStyle}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>사업·제품별 매출 비중</span>
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 16 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                width: 118,
                height: 118,
                borderRadius: "50%",
                background: `conic-gradient(${conicStops})`,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 30,
                borderRadius: "50%",
                background: "var(--panel)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700 }}>3.6조</span>
              <span style={{ fontSize: 9.5, color: "var(--faint)" }}>2025E 매출</span>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
            {revenueMix.map((r) => (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, flex: 1 }}>{r.name}</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13.5 }}>{r.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 최근 이슈·뉴스 */}
      <section style={{ ...panelStyle, gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 15 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>최근 이슈 · 뉴스</span>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "var(--down)",
              border: "1px solid var(--down)",
              padding: "1px 6px",
              borderRadius: 5,
            }}
          >
            실시간 연동 예정
          </span>
        </div>
        {news.map((n) => (
          <div
            key={n.title}
            className="hover-row"
            style={{ display: "flex", gap: 14, padding: "13px 0", borderTop: "1px solid var(--border)", alignItems: "flex-start" }}
          >
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", width: 44, flexShrink: 0, paddingTop: 2 }}>
              {n.date}
            </span>
            <span
              style={{
                background: n.tagBg,
                color: n.tagColor,
                fontSize: 10.5,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 5,
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {n.tag}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>{n.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 3 }}>{n.source}</div>
            </div>
          </div>
        ))}
      </section>

      {/* 업종 내 경쟁사 비교 */}
      <section style={{ ...panelStyle, gridColumn: "1 / -1" }}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>업종 내 경쟁사 비교</span>
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <div style={{ minWidth: 640 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr",
                gap: 0,
                fontFamily: "var(--mono)",
                fontSize: 11.5,
                color: "var(--faint)",
                paddingBottom: 11,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span>기업</span>
              <span style={{ textAlign: "right" }}>시가총액</span>
              <span style={{ textAlign: "right" }}>PER</span>
              <span style={{ textAlign: "right" }}>영업이익률</span>
              <span style={{ textAlign: "right" }}>매출성장</span>
            </div>
            {competitors.map((c) => (
              <div
                key={c.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr",
                  gap: 0,
                  padding: "13px 0",
                  borderBottom: "1px solid var(--border)",
                  alignItems: "center",
                  background: c.highlight ? "var(--accent-soft)" : "transparent",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)" }}>{c.tag}</span>
                </span>
                <span style={{ fontFamily: "var(--mono)", textAlign: "right", fontSize: 13 }}>{c.mcap}</span>
                <span style={{ fontFamily: "var(--mono)", textAlign: "right", fontSize: 13 }}>{c.per}</span>
                <span style={{ fontFamily: "var(--mono)", textAlign: "right", fontSize: 13 }}>{c.margin}</span>
                <span style={{ fontFamily: "var(--mono)", textAlign: "right", fontSize: 13, color: c.up ? "var(--up)" : "var(--down)" }}>
                  {c.growth}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function FinancialRow({
  f,
}: {
  f: { label: string; y23: string; y24: string; y25: string; up: boolean };
}) {
  return (
    <>
      <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--dim)", padding: "11px 0", borderTop: "1px solid var(--border)" }}>
        {f.label}
      </div>
      <div style={{ fontSize: 13, textAlign: "right", padding: "11px 0", borderTop: "1px solid var(--border)" }}>{f.y23}</div>
      <div style={{ fontSize: 13, textAlign: "right", padding: "11px 0", borderTop: "1px solid var(--border)" }}>{f.y24}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          textAlign: "right",
          padding: "11px 0",
          borderTop: "1px solid var(--border)",
          color: f.up ? "var(--up)" : "var(--down)",
        }}
      >
        {f.y25}
      </div>
    </>
  );
}
