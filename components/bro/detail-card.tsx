import { chgColorVar, formatChg } from "@/lib/format";
import type { CandidateDetail } from "@/lib/candidate-detail";
import type { DailyChangePoint } from "@/lib/candidate-tracking";
import type { TechnicalSignal } from "@/lib/technical-signals";

// Shared "종목 근거" block styling + DetailCard — used by both today's live
// report (components/bro/prediction-report.tsx) and 기록보관소's past-day
// detail view (components/bro/archive-prediction-detail.tsx), so opening an
// archived day shows the exact same rich per-candidate breakdown (사업요약,
// AI 추천 근거, 시황, 수급, 차트, 재무, 전략 가이드) plus the day-by-day
// 누적수익률과 기술적 시그널, instead of a thin summary-only version.

export const blockStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 14,
};

export const blockHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
};

export const badgeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "var(--accent-soft)",
  color: "var(--accent)",
  fontSize: 11,
  fontWeight: 800,
  fontFamily: "var(--mono)",
  flexShrink: 0,
};

export const blockLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text)",
};

const detailCardStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 14,
};

const fieldLineStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.65,
  color: "var(--text)",
};

const fieldLabelStyle: React.CSSProperties = {
  color: "var(--accent)",
  fontWeight: 700,
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={fieldLineStyle}>
      <span style={fieldLabelStyle}>■ {label}: </span>
      {value}
    </div>
  );
}

// 상승=빨강/하락=파랑 규칙 — components/bro/candidate-tracker.tsx와 동일.
function signalColor(direction: TechnicalSignal["direction"]): string {
  if (direction === "bullish") return "var(--up)";
  if (direction === "bearish") return "var(--down)";
  return "var(--dim)";
}

export function DetailCard({
  d,
  series,
  signals,
}: {
  d: CandidateDetail;
  series?: DailyChangePoint[];
  signals?: TechnicalSignal[];
}) {
  return (
    <div style={{ ...detailCardStyle, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>
          {d.name}
          {d.code && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", marginLeft: 5 }}>
              ({d.code})
            </span>
          )}
        </span>
        {d.themeTags.length > 0 && <span style={{ color: "var(--faint)" }}>|</span>}
        {d.themeTags.map((t) => (
          <span
            key={t}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--accent)",
              background: "var(--accent-soft)",
              borderRadius: 20,
              padding: "2px 9px",
            }}
          >
            #{t}
          </span>
        ))}
        {d.isThemeLeader && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              color: "var(--up)",
              background: "var(--up-soft)",
              borderRadius: 20,
              padding: "2px 9px",
            }}
          >
            대장주
          </span>
        )}
      </div>

      <Field label="사업 한 줄 요약" value={d.businessSummary} />
      <Field label="AI 추천 근거" value={d.aiReasoning} />
      <Field label="시황" value={d.marketContext} />
      <Field label="수급 상태" value={d.supplyDemand} />
      <Field label="차트" value={d.chartNote} />
      <Field label="재무요약" value={d.financialSummary} />

      <div style={fieldLineStyle}>
        <span style={fieldLabelStyle}>■ 전략 가이드:</span>
        <div style={{ paddingLeft: 14, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          <div>
            - 목표 구간:{" "}
            {d.strategy.targetPrice !== null ? (
              <>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                  {Math.round(d.strategy.targetPrice).toLocaleString()}원
                </span>{" "}
                {d.strategy.targetPct !== null && (
                  <span style={{ fontFamily: "var(--mono)", color: chgColorVar(d.strategy.targetPct) }}>
                    (기대수익 {formatChg(d.strategy.targetPct)})
                  </span>
                )}
              </>
            ) : (
              "데이터 부족"
            )}
          </div>
          <div>
            - 지지/손절선:{" "}
            {d.strategy.stopLossPrice !== null ? (
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                {Math.round(d.strategy.stopLossPrice).toLocaleString()}원
              </span>
            ) : (
              "데이터 부족"
            )}{" "}
            이탈 시 비중 축소
          </div>
        </div>
      </div>

      {series && series.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
          {series.map((p) => (
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

      {signals && signals.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginTop: 4,
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
          }}
        >
          {signals.map((s) => (
            <div key={s.name} style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--dim)" }}>
              <span style={{ fontWeight: 700, color: signalColor(s.direction) }}>시그널: {s.name}</span>
              {" — "}
              {s.detail}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
