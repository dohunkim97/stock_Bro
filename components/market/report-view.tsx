import type { ReportData } from "@/lib/reports-data";

export function ReportView({
  report,
  periodWord,
}: {
  report: ReportData;
  periodWord: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20, alignItems: "start" }}>
      {/* AI 분석 요약 */}
      <section
        style={{
          gridColumn: "1 / -1",
          background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
          border: "1px solid var(--border2)",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg, var(--accent), var(--up))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0d13",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            B
          </div>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--accent)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {report.kicker}
          </span>
        </div>
        <h2 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.35 }}>
          {report.headline}
        </h2>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75, color: "var(--dim)", maxWidth: 900 }}>
          {report.body}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          {report.keywords.map((k) => (
            <span
              key={k.text}
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: "6px 13px",
                fontSize: 12.5,
                fontWeight: 600,
                color: k.color,
              }}
            >
              #{k.text}
            </span>
          ))}
        </div>
      </section>

      {/* 기간 지수 */}
      <section style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {report.stats.map((st) => (
          <div
            key={st.label}
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 13,
              padding: "16px 18px",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>{st.label}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700 }}>{st.value}</div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 12.5,
                fontWeight: 600,
                marginTop: 5,
                color: st.up ? "var(--up)" : "var(--down)",
              }}
            >
              {st.chg}
            </div>
          </div>
        ))}
      </section>

      {/* 기간 주도 섹터 */}
      <section style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{periodWord} 주도 섹터</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>등장 빈도순</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {report.sectors.map((sec) => {
            const color = sec.hot ? "var(--accent)" : "var(--text)";
            const barColor = sec.hot ? "var(--accent)" : "var(--dim)";
            return (
              <div key={sec.name}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color }}>{sec.name}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)" }}>
                    {sec.freq} · <b style={{ color }}>{sec.pct}</b>
                  </span>
                </div>
                <div style={{ height: 9, background: "var(--bg)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: sec.width, background: barColor, borderRadius: 6 }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 기간 상승 주도주 */}
      <section style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{periodWord} 상승 주도주</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--up)" }}>누적 등락률</span>
        </div>
        {report.leaders.map((s) => (
          <div
            key={s.rank}
            style={{
              display: "grid",
              gridTemplateColumns: "22px 1fr 90px 78px",
              gap: 0,
              padding: "12px 0",
              alignItems: "center",
              borderBottom: "1px solid var(--border)",
              fontSize: 13.5,
            }}
          >
            <span style={{ fontFamily: "var(--mono)", color: "var(--faint)", fontSize: 12 }}>{s.rank}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)" }}>{s.sector}</span>
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)" }}>{s.freq}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700, color: "var(--up)" }}>{s.chg}</span>
          </div>
        ))}
      </section>

      {/* 기간 흐름 코멘트 */}
      <section style={{ gridColumn: "1 / -1", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{periodWord} 흐름 · 다음 관전 포인트</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
          {report.notes.map((n) => (
            <div
              key={n.title}
              style={{
                display: "flex",
                gap: 12,
                padding: 14,
                background: "var(--panel2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: n.iconBg,
                  color: n.iconColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {n.icon}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 3 }}>{n.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.55 }}>{n.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
