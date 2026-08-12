import Link from "next/link";
import {
  getLatestPrediction,
  getScoredPredictionHistory,
  parsePredictionSectors,
  parsePredictionCandidates,
} from "@/lib/prediction-scoring";
import { weekInfoFromKey } from "@/lib/week";
import { renderBold } from "@/components/ui/rich-text";
import { fetchKisQuote } from "@/lib/kis-quote";
import { chgColorVar, formatChg } from "@/lib/format";

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
  border: "1px solid var(--border2)",
  borderRadius: 16,
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const boxStyle: React.CSSProperties = {
  padding: "13px 15px",
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

function dateLabel(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// The right-side panel on /bro — the same "다음 주 예측" data that
// components/market/weekly-prediction-panel.tsx shows on /market, but
// reframed for the chat context: what the prediction is based on (출처),
// how each candidate has actually moved since it was first predicted, and a
// clickable archive of past weeks once they're old enough to score.
export async function PredictionPanel() {
  const [latest, history] = await Promise.all([getLatestPrediction(), getScoredPredictionHistory(10)]);

  if (!latest) {
    return (
      <section style={panelStyle}>
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>
          아직 생성된 다음 주 예측이 없어요. 평일 장마감 후 자동으로 생성돼요.
        </div>
      </section>
    );
  }

  const sectors = parsePredictionSectors(latest.sectors);
  const candidates = parsePredictionCandidates(latest.candidates);
  const info = weekInfoFromKey(latest.forWeekKey);

  // Only ever 3-5 candidates, so a live quote per code is cheap — this is
  // what "예상 시점 대비 상승률" is measured against, not a stored/stale value.
  const liveQuotes = await Promise.all(
    candidates.map((c) => (c.code ? fetchKisQuote(c.code) : Promise.resolve(null)))
  );

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          G
        </div>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--accent)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Golgoo · {info.label} 전망
        </span>
      </div>

      <div>
        <div style={sectionTitleStyle}>출처 — 이렇게 예상했어</div>
        <div style={{ ...boxStyle, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text)" }}>{renderBold(latest.summary)}</div>
          {sectors.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              {sectors.map((s) => (
                <div key={s.name} style={{ fontSize: 12, lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, marginRight: 5, color: "var(--text)" }}>{s.name}</span>
                  <span style={{ color: "var(--dim)" }}>{renderBold(s.reasoning)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {candidates.length > 0 && (
        <div>
          <div style={sectionTitleStyle}>예상한 종목 상승률</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.map((c, i) => {
              const q = liveQuotes[i];
              const changeSincePredicted =
                c.basePrice && c.basePrice > 0 && q ? ((q.price - c.basePrice) / c.basePrice) * 100 : null;
              return (
                <Link
                  key={c.name}
                  href={c.code ? `/stock?code=${c.code}` : "/stock"}
                  className="hover-accent-border"
                  style={{ ...boxStyle, display: "block", textDecoration: "none" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{c.name}</span>
                    {changeSincePredicted !== null ? (
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 13,
                          fontWeight: 700,
                          color: chgColorVar(changeSincePredicted),
                        }}
                      >
                        {formatChg(changeSincePredicted)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10.5, color: "var(--faint)" }}>추적 불가</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 4, lineHeight: 1.5 }}>
                    {renderBold(c.reasoning)}
                  </div>
                  {c.firstSeenAt && (
                    <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 6, fontFamily: "var(--mono)" }}>
                      {dateLabel(c.firstSeenAt)} 예상 시점 대비
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <div style={sectionTitleStyle}>지난 예측 기록</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map((h) => (
              <details key={h.forWeekKey} className="no-marker" style={{ ...boxStyle, padding: 0 }}>
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
        </div>
      )}
    </section>
  );
}
