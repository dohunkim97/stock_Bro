import Link from "next/link";
import { getLatestPrediction, parsePredictionCandidates } from "@/lib/prediction-scoring";
import { weekInfoFromKey } from "@/lib/week";
import { renderBold } from "@/components/ui/rich-text";
import { getDailyChangeSeries } from "@/lib/candidate-tracking";
import { fetchKisChart } from "@/lib/kis-chart";
import { computeTechnicalSignals, type TechnicalSignal } from "@/lib/technical-signals";
import { chgColorVar, formatChg } from "@/lib/format";

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
  border: "1px solid var(--border2)",
  borderRadius: 16,
  padding: 20,
  height: "100%",
  overflowY: "auto",
};

const boxStyle: React.CSSProperties = {
  padding: "13px 15px",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

function dateLabel(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// 상승=빨강/하락=파랑 (이 앱의 색상 규칙, lib/format.ts의 chgColorVar 참고) —
// 시그널 방향(direction)에도 같은 규칙 적용.
function signalColor(direction: TechnicalSignal["direction"]): string {
  if (direction === "bullish") return "var(--up)";
  if (direction === "bearish") return "var(--down)";
  return "var(--dim)";
}

// "예상한 종목 상승률" on its own — how each of Golgoo's currently-predicted
// candidates has actually moved since it was first predicted. Split out of
// what used to be the combined PredictionPanel so it can sit in its own
// slot in the /bro layout, independent of the summary/기록보관소 sections.
export async function CandidateTracker() {
  const latest = await getLatestPrediction();
  if (!latest) {
    return (
      <section style={panelStyle}>
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>
          아직 생성된 다음 주 예측이 없어요. 평일 장마감 후 자동으로 생성돼요.
        </div>
      </section>
    );
  }

  const candidates = parsePredictionCandidates(latest.candidates);
  const info = weekInfoFromKey(latest.forWeekKey);

  // Only ever 3-5 candidates, so a daily-chart fetch per code is cheap — one
  // fetch per candidate feeds both "예상 시점 대비 상승률" (day by day) and
  // the 거래량/지지·저항 기술적 시그널 (lib/technical-signals.ts), instead of
  // fetching the same chart twice.
  const candles = await Promise.all(candidates.map((c) => (c.code ? fetchKisChart(c.code, "D") : Promise.resolve([]))));
  const series = candidates.map((c, i) => (c.firstSeenAt ? getDailyChangeSeries(candles[i], c.firstSeenAt) : []));
  const signals = candles.map((cs) => computeTechnicalSignals(cs));

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
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          예상한 종목 상승률 · {info.label}
        </span>
      </div>

      {candidates.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {candidates.map((c, i) => {
            const days = series[i];
            const latestPoint = days.length > 0 ? days[days.length - 1] : null;
            return (
              <Link
                key={c.name}
                href={c.code ? `/stock?code=${c.code}` : "/stock"}
                className="hover-accent-border"
                style={{ ...boxStyle, display: "block", textDecoration: "none" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{c.name}</span>
                  {latestPoint ? (
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 13,
                        fontWeight: 700,
                        color: chgColorVar(latestPoint.changePct),
                      }}
                    >
                      {formatChg(latestPoint.changePct)}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10.5, color: "var(--faint)" }}>추적 불가</span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 4, lineHeight: 1.5 }}>
                  {renderBold(c.reasoning)}
                </div>
                {days.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {days.map((p) => (
                      <span
                        key={p.date}
                        title={p.date}
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--mono)",
                          fontWeight: 600,
                          padding: "3px 7px",
                          borderRadius: 6,
                          background: "var(--panel2)",
                          color: chgColorVar(p.changePct),
                        }}
                      >
                        {p.dayIndex}일차 {formatChg(p.changePct)}
                      </span>
                    ))}
                  </div>
                )}
                {c.firstSeenAt && (
                  <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 6, fontFamily: "var(--mono)" }}>
                    {dateLabel(c.firstSeenAt)} 예상 · 종가 기준 누적
                  </div>
                )}
                {signals[i].length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                    {signals[i].map((s) => (
                      <div key={s.name} style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--dim)" }}>
                        <span style={{ fontWeight: 700, color: signalColor(s.direction) }}>시그널: {s.name}</span>
                        {" — "}
                        {s.detail}
                      </div>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--faint)" }}>이번 주 예상 종목이 아직 없어요.</div>
      )}
    </section>
  );
}
