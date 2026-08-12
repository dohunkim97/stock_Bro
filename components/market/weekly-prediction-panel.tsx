import Link from "next/link";
import {
  getLatestPrediction,
  getScoredPredictionHistory,
  parsePredictionSectors,
  parsePredictionCandidates,
} from "@/lib/prediction-scoring";
import { weekInfoFromKey } from "@/lib/week";
import { renderBold } from "@/components/ui/rich-text";

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
  border: "1px solid var(--border2)",
  borderRadius: 16,
  padding: 24,
};

const boxStyle: React.CSSProperties = {
  padding: "14px 16px",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

function pct(v: number | null): string {
  return v === null ? "-" : `${Math.round(v * 100)}%`;
}

// Evergreen, not tied to whatever date the day-view is scoped to — a
// forward-looking call is relevant regardless of which past date you're
// browsing, so this doesn't gate on date === today the way AiBriefing does.
export async function WeeklyPredictionPanel() {
  const [latest, history] = await Promise.all([getLatestPrediction(), getScoredPredictionHistory(6)]);
  if (!latest) return null;

  const sectors = parsePredictionSectors(latest.sectors);
  const candidates = parsePredictionCandidates(latest.candidates);
  const info = weekInfoFromKey(latest.forWeekKey);

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
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
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Golgoo · {info.label} 전망
        </span>
      </div>

      <p style={{ margin: "0 0 18px", fontSize: 14.5, lineHeight: 1.75, color: "var(--text)", maxWidth: 900 }}>
        {renderBold(latest.summary)}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {sectors.length > 0 && (
          <div style={boxStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>예측 섹터·테마</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sectors.map((s) => (
                <div key={s.name} style={{ fontSize: 13, lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, marginRight: 5 }}>{s.name}</span>
                  <span style={{ color: "var(--text)" }}>{renderBold(s.reasoning)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {candidates.length > 0 && (
          <div style={boxStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>예측 종목</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {candidates.map((c) => (
                <Link
                  key={c.name}
                  href={c.code ? `/stock?code=${c.code}` : "/stock"}
                  className="hover-accent-border"
                  style={{ fontSize: 13, lineHeight: 1.55, display: "block" }}
                >
                  <span style={{ fontWeight: 700, marginRight: 5 }}>{c.name}</span>
                  <span style={{ color: "var(--text)" }}>{renderBold(c.reasoning)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--faint)", fontFamily: "var(--mono)", marginBottom: 8 }}>
            지난 예측 적중 이력
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {history.map((h) => (
              <div
                key={h.forWeekKey}
                style={{
                  fontSize: 12,
                  color: "var(--dim)",
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 10px",
                }}
              >
                {h.label} · 섹터 {pct(h.sectorHitRate)} · 종목 {pct(h.candidateHitRate)}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
