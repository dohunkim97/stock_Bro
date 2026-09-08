import Link from "next/link";
import { chgColorVar, formatChg } from "@/lib/format";
import type { CandidateDetail } from "@/lib/candidate-detail";
import { TRACKING_WINDOW_DAYS, type DailyChangePoint } from "@/lib/candidate-tracking";
import type { TechnicalSignal } from "@/lib/technical-signals";

// Shared "종목 근거" block styling + DetailCard — used by both today's live
// report (components/bro/prediction-report.tsx) and 기록보관소's past-day
// detail view (components/bro/archive-prediction-detail.tsx), so opening an
// archived day shows the exact same rich per-candidate breakdown plus the
// day-by-day 누적수익률과 기술적 시그널, instead of a thin summary-only version.
// 근거는 항상 사업 요약 + 1~7번 고정 순서(시황/거래량/차트/재료/수급/재무/
// 매수타이밍) — 데이터 없는 항목은 "내용 없음"으로 그대로 보여준다
// (lib/candidate-detail.ts의 CandidateDetail이 이 틀에 맞춰 채워줌).

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

// 7번 "매수타이밍" 한 줄 — 지지선/저항선은 실제 차트 레벨을 그대로, 목표/손절은
// 항상 같은 규칙(기대수익 최소 +6%, 손절 -4%)이라 종목마다 문구가 달라지지
// 않는다. 데이터가 아예 없는 후보(코드 미확인 등)는 통째로 "내용 없음".
function buyTimingText(s: CandidateDetail["strategy"]): string {
  if (s.support === null && s.resistance === null && s.targetPrice === null && s.stopLossPrice === null) {
    return "내용 없음";
  }
  const supportPart = s.support !== null ? `지지선 ${Math.round(s.support).toLocaleString()}원` : "지지선 내용 없음";
  const resistancePart =
    s.resistance !== null ? `저항선 ${Math.round(s.resistance).toLocaleString()}원` : "저항선 내용 없음";
  const rulePart =
    s.targetPrice !== null && s.stopLossPrice !== null
      ? `기대수익 최소 +6%(목표 ${Math.round(s.targetPrice).toLocaleString()}원) · 손절 -4%(${Math.round(s.stopLossPrice).toLocaleString()}원)`
      : null;
  return [supportPart, resistancePart, rulePart].filter(Boolean).join(" / ");
}

// 상승=빨강/하락=파랑 규칙 — components/bro/candidate-tracker.tsx와 동일.
function signalColor(direction: TechnicalSignal["direction"]): string {
  if (direction === "bullish") return "var(--up)";
  if (direction === "bearish") return "var(--down)";
  return "var(--dim)";
}

type DayMark = DailyChangePoint & { hitStopToday: boolean; hitTargetToday: boolean };

// 손절가/목표가 "도달"은 그 상태가 계속 이어지는 동안 매일 반복 표시하지
// 않는다 — 처음 닿은 그 날짜 하루만 표시하고, 손절가는 매수가(changePct
// 0% 이상, 즉 원금 회복) 위로 복귀하면 상태를 리셋해 나중에 다시 손절가에
// 닿으면 그날을 새로운 사건으로 다시 표시한다. 목표가는 한 번 찍으면
// 그걸로 확정(반복/리셋 없이 최초 1회만)이라 되돌아와도 다시 표시하지
// 않는다 — 이미 목표수익을 넘긴 사실 자체는 되돌릴 수 없는 성과라서.
function markDays(series: DailyChangePoint[], stopLossPrice: number | null, targetPrice: number | null): DayMark[] {
  let belowStop = false;
  let targetAlreadyHit = false;

  return series.map((p) => {
    const touchedStop = stopLossPrice !== null && p.price <= stopLossPrice;
    const touchedTarget = targetPrice !== null && p.price >= targetPrice;

    const hitStopToday = touchedStop && !belowStop;
    const hitTargetToday = touchedTarget && !targetAlreadyHit;

    if (touchedStop) belowStop = true;
    else if (p.changePct >= 0) belowStop = false; // 매수가 복귀 — 다음 이탈은 새 사건

    if (hitTargetToday) targetAlreadyHit = true;

    return { ...p, hitStopToday, hitTargetToday };
  });
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
  const nameBlock = (
    <span style={{ fontWeight: 800, fontSize: 13.5 }}>
      {d.name}
      {d.code && (
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", marginLeft: 5 }}>
          ({d.code})
        </span>
      )}
    </span>
  );

  return (
    <div style={{ ...detailCardStyle, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        {d.code ? (
          <Link
            href={`/stock?code=${d.code}`}
            className="hover-accent-border"
            title="차트·재무 등 종목 상세 보기"
            style={{
              display: "inline-flex",
              textDecoration: "none",
              color: "inherit",
              border: "1px solid transparent",
              borderRadius: 6,
              padding: "1px 4px",
              margin: "-1px -4px",
            }}
          >
            {nameBlock}
          </Link>
        ) : (
          nameBlock
        )}
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

      <Field label="사업 요약" value={d.businessSummary} />
      <Field label="1. 시황" value={d.marketContext} />
      <Field label="2. 거래량" value={d.volumeNote} />
      <Field label="3. 차트" value={d.chartNote} />
      <Field label="4. 재료" value={d.aiReasoning} />
      <Field label="5. 수급" value={d.supplyDemand} />
      <Field label="6. 재무" value={d.financialSummary} />
      <Field label="7. 매수타이밍" value={buyTimingText(d.strategy)} />

      {series && series.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
          {markDays(series, d.strategy.stopLossPrice, d.strategy.targetPrice).map((p) => {
            const marked = p.hitStopToday || p.hitTargetToday;
            const markColor = p.hitStopToday ? "var(--down)" : p.hitTargetToday ? "var(--up)" : chgColorVar(p.changePct);
            return (
              <span
                key={p.date}
                title={p.date}
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  fontWeight: 700,
                  padding: "3px 7px",
                  borderRadius: 6,
                  background: marked ? "transparent" : "var(--panel2)",
                  border: marked ? `1px solid ${markColor}` : "1px solid transparent",
                  color: markColor,
                }}
              >
                {p.dayIndex}일차 {formatChg(p.changePct)}
                {p.hitStopToday && " · 손절가 도달"}
                {p.hitTargetToday && " · 목표수익 돌파"}
              </span>
            );
          })}
        </div>
      )}

      {/* 5거래일 추적이 다 끝난 뒤에만 "최종 결과"로 확정해서 기대수익(전략
          가이드의 목표구간 기준)과 매수가 대비 5일 누적 수익률을 나란히
          비교해 보여준다 — 진행 중인 예측은 아직 최종이 아니므로 이 줄
          자체를 숨긴다. series의 마지막 changePct는 이미 1일차 매수가 대비
          누적값이라(각 날짜 칩 자체가 그날까지의 누적 % — 매일 갈아 끼우는
          "당일 등락률"이 아니다) 그대로 쓰면 곧 5일 총 수익률이다 — 별도로
          더하거나 다시 계산할 필요가 없다.
      */}
      {series && series.length >= TRACKING_WINDOW_DAYS && (
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            lineHeight: 1.6,
            padding: "7px 10px",
            borderRadius: 8,
            background: "var(--panel2)",
            border: "1px solid var(--border2)",
          }}
        >
          🏁 {TRACKING_WINDOW_DAYS}거래일 누적 최종 —{" "}
          <span style={{ fontFamily: "var(--mono)", color: chgColorVar(series[series.length - 1].changePct) }}>
            매수가 대비 총 {formatChg(series[series.length - 1].changePct)}
          </span>
          {d.strategy.targetPct !== null && (
            <>
              {" "}
              /{" "}
              <span style={{ fontFamily: "var(--mono)", color: "var(--dim)" }}>
                기대 {formatChg(d.strategy.targetPct)}
              </span>
            </>
          )}
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
            <div key={s.name} style={{ fontSize: 11.5, lineHeight: 1.55, fontWeight: 700, color: "var(--text)" }}>
              <span style={{ color: signalColor(s.direction) }}>시그널: {s.name}</span>
              {" — "}
              {s.detail}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
