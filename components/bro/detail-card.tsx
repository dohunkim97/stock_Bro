"use client";

import { useState } from "react";
import Link from "next/link";
import { chgColorVar, formatChg } from "@/lib/format";
import type { CandidateDetail } from "@/lib/candidate-detail";
import { TRACKING_WINDOW_DAYS, type DailyChangePoint } from "@/lib/candidate-tracking";
import type { TechnicalSignal } from "@/lib/technical-signals";
import { SENTIMENT_REGEX, sentimentColorVar } from "@/lib/sentiment";
import type { FieldKey } from "@/lib/field-detail";
import { FieldDetailModal } from "./field-detail-modal";

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

// 국내 증시 관례(상승=빨강/하락=파랑)에 맞춰 근거 문장 안의 좋은 단어(매수·
// 흑자·증가·상승)는 빨간색, 나쁜 단어(매도·적자·감소·하락)는 파란색으로 한눈에
// 보이게 강조한다 — 단어 목록/판정 기준은 lib/candidate-detail.ts의 O/X
// 판단(재료 항목)과 같은 lib/sentiment.ts를 공유해서 색깔과 O/X가 서로
// 어긋나지 않게 한다. "92억 매수"처럼 단어 바로 앞 숫자·단위까지 한 덩어리로
// 같이 색칠된다(SENTIMENT_REGEX가 이미 그렇게 잡아줌).
function sentimentStyle(token: string): string | null {
  const c = sentimentColorVar(token);
  return c === "up" ? "var(--up)" : c === "down" ? "var(--down)" : null;
}

// **강조** 마크다운(lib/weekly-prediction.ts가 심어줌)을 굵게 살리고, 그 안팎
// 텍스트에서 위 긍정/부정 단어(+수치)를 색칠한다. 근거 필드 전체(사업요약~
// 매수타이밍)가 전부 이 함수를 거쳐서 렌더링된다.
function renderFieldValue(text: string): React.ReactNode {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  return boldParts.map((part, i) => {
    const isBold = part.startsWith("**") && part.endsWith("**") && part.length > 4;
    const inner = isBold ? part.slice(2, -2) : part;
    const tokens = inner.split(SENTIMENT_REGEX).map((tok, j) => {
      const color = sentimentStyle(tok);
      return color ? (
        <span key={j} style={{ color, fontWeight: 700 }}>
          {tok}
        </span>
      ) : (
        tok
      );
    });
    return isBold ? (
      <strong key={i} style={{ fontWeight: 800 }}>
        {tokens}
      </strong>
    ) : (
      <span key={i}>{tokens}</span>
    );
  });
}

// verdict: 이 항목이 실제로 매수에 우호적인 신호인지(true=O/빨강),
// 아닌지(false=X/파랑) — 판단 불가(null/undefined)면 아예 안 띄운다.
// onClick이 있으면(7항목 중 실제로 심층 모달이 있는 것들) 이 줄 전체가
// 버튼이 되어 클릭 시 그 항목만 전문가 수준으로 파고드는 모달을 연다 —
// components/bro/field-detail-modal.tsx.
function Field({
  label,
  value,
  verdict,
  onClick,
}: {
  label: string;
  value: string;
  verdict?: boolean | null;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span style={fieldLabelStyle}>■ {label}: </span>
      {renderFieldValue(value)}
      {verdict !== undefined && verdict !== null && (
        <strong style={{ marginLeft: 6, color: verdict ? "var(--up)" : "var(--down)" }}>
          {verdict ? "(O)" : "(X)"}
        </strong>
      )}
      {onClick && <span style={{ marginLeft: 6, color: "var(--faint)", fontSize: 10.5 }}>자세히 보기 ›</span>}
    </>
  );

  if (!onClick) return <div style={fieldLineStyle}>{content}</div>;

  return (
    <button
      onClick={onClick}
      className="hover-accent-border"
      style={{
        ...fieldLineStyle,
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "1px solid transparent",
        borderRadius: 6,
        padding: "2px 4px",
        margin: "-2px -4px",
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
      }}
    >
      {content}
    </button>
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
  const [openField, setOpenField] = useState<FieldKey | null>(null);
  const openFieldModal = (field: FieldKey) => () => setOpenField(field);

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

      <Field label="사업 요약" value={d.businessSummary} onClick={openFieldModal("business")} />
      <Field label="1. 시황" value={d.marketContext} verdict={d.verdicts.marketContext} onClick={openFieldModal("market")} />
      <Field label="2. 거래량" value={d.volumeNote} verdict={d.verdicts.volume} onClick={openFieldModal("volume")} />
      <Field label="3. 차트" value={d.chartNote} verdict={d.verdicts.chart} onClick={openFieldModal("chart")} />
      <Field label="4. 재료" value={d.aiReasoning} verdict={d.verdicts.material} onClick={openFieldModal("material")} />
      <Field label="5. 수급" value={d.supplyDemand} verdict={d.verdicts.supplyDemand} onClick={openFieldModal("supply")} />
      <Field label="6. 재무" value={d.financialSummary} verdict={d.verdicts.financial} onClick={openFieldModal("financial")} />
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
                {p.dayIndex}일차 종가 {Math.round(p.price).toLocaleString()} · {p.dayIndex}일차 누적{" "}
                {formatChg(p.changePct)}
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

      <FieldDetailModal
        open={openField !== null}
        onClose={() => setOpenField(null)}
        field={openField}
        code={d.code}
        name={d.name}
        reasoning={d.aiReasoning}
      />
    </div>
  );
}
