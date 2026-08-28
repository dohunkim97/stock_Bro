import Link from "next/link";
import { getLatestPrediction, parsePredictionCandidates } from "@/lib/prediction-scoring";
import { formatDateLabel } from "@/lib/dates";
import { getDailyChangeSeries } from "@/lib/candidate-tracking";
import { fetchKisChart } from "@/lib/kis-chart";
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
  const forDateLabel = formatDateLabel(latest.forDate);

  // Only ever 3-5 candidates, so a daily-chart fetch per code is cheap.
  // Every candidate in this row shares the same anchor date (latest.forDate)
  // now that predictions publish daily — there's no more per-candidate
  // firstSeenAt. AI 추천 근거와 기술적 시그널은 이제 이 위젯이 아니라
  // PredictionReport의 "종목 근거" 카드 쪽에서 보여준다 — 여기는 순수하게
  // 날짜별 누적 상승률만 보여주는 라이브 트래커 역할만 한다.
  const candles = await Promise.all(candidates.map((c) => (c.code ? fetchKisChart(c.code, "D") : Promise.resolve([]))));
  const series = candles.map((cs) => getDailyChangeSeries(cs, latest.forDate));

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
          예상한 종목 상승률 · {forDateLabel}
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
                <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 6, fontFamily: "var(--mono)" }}>
                  {dateLabel(latest.forDate)} 종가 매수 기준 누적
                </div>
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
