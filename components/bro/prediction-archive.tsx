import { getScoredPredictionHistory } from "@/lib/prediction-scoring";
import { renderBold } from "@/components/ui/rich-text";
import { chgColorVar, formatChg } from "@/lib/format";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
};

const rowStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--accent)",
  fontFamily: "var(--mono)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: 10,
};

function pct(v: number | null): string {
  return v === null ? "-" : `${Math.round(v * 100)}%`;
}

// "기록보관소" — past weeks' predictions once they're old enough to score,
// click to expand into the full summary and per-sector/candidate hit/miss.
// Split out of what used to be the combined PredictionPanel so it can sit
// in its own slot in the /bro layout.
export async function PredictionArchive() {
  const history = await getScoredPredictionHistory(10);
  if (history.length === 0) {
    return (
      <section style={panelStyle}>
        <div style={sectionTitleStyle}>🗄️ 기록보관소 · 예상리포트</div>
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>
          아직 채점된 지난 주가 없어요 — 한 주가 끝나면 여기 쌓이기 시작해요.
        </div>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div style={sectionTitleStyle}>🗄️ 기록보관소 · 예상리포트</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {history.map((h) => (
          <details key={h.forWeekKey} className="no-marker" style={{ ...rowStyle, padding: 0 }}>
            <summary
              style={{
                cursor: "pointer",
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="chevron" style={{ fontSize: 10, color: "var(--faint)" }}>
                  ▶
                </span>
                <span style={{ fontWeight: 700 }}>{h.label}</span>
              </span>
              <span style={{ color: "var(--dim)", fontFamily: "var(--mono)", fontSize: 10.5 }}>
                섹터 {pct(h.sectorHitRate)} · 종목 {pct(h.candidateHitRate)}
              </span>
            </summary>
            <div style={{ padding: "0 14px 14px", fontSize: 11.5, lineHeight: 1.6, color: "var(--text)" }}>
              <p style={{ margin: "0 0 10px" }}>{renderBold(h.summary)}</p>
              {h.sectors.length > 0 && (
                <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                  {h.sectors.map((s) => (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{s.hit ? "✅" : "❌"}</span>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {h.candidates.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {h.candidates.map((c) => (
                    <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{c.hit ? "✅" : "❌"}</span>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      {c.actualAvgChangePct !== null && (
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: chgColorVar(c.actualAvgChangePct) }}>
                          {formatChg(c.actualAvgChangePct)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
