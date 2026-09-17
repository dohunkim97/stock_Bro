"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { chgColorVar, formatChg } from "@/lib/format";
import type { CandidateDetail } from "@/lib/candidate-detail";
import { TRACKING_WINDOW_DAYS, type DailyChangePoint } from "@/lib/candidate-tracking";
import type { TechnicalSignal } from "@/lib/technical-signals";
import type { FieldKey } from "@/lib/field-detail";
import { FieldDetailModal, FieldDetailContent } from "./field-detail-modal";

// Shared "종목 근거" block styling + DetailCard — used by 오늘의 라이브 리포트
// (components/bro/prediction-report.tsx), 기록보관소의 과거 상세
// (components/bro/archive-prediction-detail.tsx), 종목상세의 골구 근거 패널
// (components/stock/golgoo-panel.tsx, 고정 380px 폭 — 아래 참고) 세 곳에서
// 재사용한다.
//
// 예전엔 사업요약~매수타이밍 7항목을 위에서 아래로 쭉 읽어야 하는 줄글
// 목록이었는데(스크린샷 기준 사용자 피드백), [좌: 6항목 카드 목록 / 우: 선택한
// 항목의 상세 뷰어] 좌우 대시보드로 바꿨다 — 우측 뷰어는 모달(field-detail-
// modal.tsx)이 이미 갖고 있던 항목별 카드/표 렌더링(FieldDetailContent)을
// 그대로 인라인으로 가져다 쓴다(Modal 틀만 벗겨냄). 폭이 좁은 곳(예:
// golgoo-panel.tsx의 고정 380px 사이드바)에서는 ResizeObserver로 실측한
// 컨테이너 폭을 보고 자동으로 세로 1열로 접힌다 — 어느 자리에 놓여도 깨지지
// 않게.
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
  padding: 16,
};

// 이 폭보다 좁은 컨테이너(예: golgoo-panel.tsx의 380px 고정 사이드바)에서는
// 좌 40 / 우 60 좌우 배치 대신 세로 1열(카드 목록 → 선택한 항목 상세)로
// 접는다.
const WIDE_BREAKPOINT = 640;

// 컨테이너 실측 폭 — 서버 렌더/최초 마운트 시점엔 0이라 일단 "좁다"고
// 가정한다(스크롤 있는 좁은 패널에서 넓은 레이아웃이 잠깐 그려졌다 깨지는
// 것보다, 넓은 화면에서 아주 잠깐 1열로 보였다가 바로 2열로 펴지는 쪽이
// 덜 어색하다).
function useContainerWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

// 판정(O/X/판단불가)을 그린/레드/옐로우 3색 칩으로 — "판단보류"는 --accent
// (이 앱 팔레트에서 이미 골드/옐로우 톤)를 재사용해 새 색상 토큰 없이도
// 요청한 3색 체계를 만족한다.
function VerdictChip({ verdict }: { verdict: boolean | null }) {
  const cfg =
    verdict === true
      ? { fg: "var(--up)", bg: "var(--up-soft)", label: "긍정" }
      : verdict === false
        ? { fg: "var(--down)", bg: "var(--down-soft)", label: "부정" }
        : { fg: "var(--accent)", bg: "var(--accent-soft)", label: "중립" };
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 800,
        color: cfg.fg,
        background: cfg.bg,
        borderRadius: 20,
        padding: "2px 8px",
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  );
}

// 카드 목록의 1줄 요약 — **볼드** 마커를 지우고 공백을 접어서 한 줄
// 미리보기만 보여준다(전체 내용은 우측 상세 뷰어가 카드/표로 따로 보여줌).
function oneLinePreview(text: string): string {
  const clean = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return "내용 없음";
  return clean.length > 44 ? `${clean.slice(0, 44)}…` : clean;
}

type MiniField = { key: FieldKey; num: number; label: string; text: string; verdict: boolean | null };

function MiniFieldCard({ field, active, onClick }: { field: MiniField; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hover-accent-border"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: active ? "var(--accent-soft)" : "var(--panel2)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: active ? "var(--accent)" : "var(--text)" }}>
          {field.num}. {field.label}
        </span>
        <VerdictChip verdict={field.verdict} />
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--dim)",
          lineHeight: 1.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {oneLinePreview(field.text)}
      </div>
    </button>
  );
}

const strategyStatStyle: React.CSSProperties = { flex: 1, minWidth: 0 };

function StrategyStat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={strategyStatStyle}>
      <div style={{ fontSize: 9.5, color: "var(--faint)", fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "var(--mono)" }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: "var(--faint)", fontFamily: "var(--mono)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// 매수가/목표가/손절가/기대손익비 강조 박스 — 매수가(entryPrice, forDate
// 종가 anchor)가 없으면 목표가/손절가 %가 뭘 기준으로 계산된 건지 알 수
// 없어서 사용자가 헷갈릴 수 있다(실제 문의: "예상종목 매수가가 없다") —
// 목표가/손절가/기대손익비 옆에 그 기준이 되는 매수가를 항상 같이 보여준다.
// entryPrice는 이 필드가 생기기 전에 저장된 옛 WeeklyPrediction.details
// 레코드엔 없을 수 있어(JSON.parse하면 undefined) `!= null`로 느슨하게
// 검사한다. 손절은 항상 고정 -4% 규칙(lib/candidate-detail.ts 주석 참고)
// 이라 손절률은 계산 없이 고정 표기하고, 기대손익비는 목표수익률
// (targetPct) ÷ 4로 낸 R-배수다.
function StrategyStrip({ s }: { s: CandidateDetail["strategy"] }) {
  if (s.targetPrice === null && s.stopLossPrice === null) return null;
  const ratio = s.targetPct !== null && s.stopLossPrice !== null ? s.targetPct / 4 : null;

  return (
    <div
      style={{
        display: "flex",
        background: "var(--panel2)",
        border: "1px solid var(--border2)",
        borderRadius: 10,
        padding: "11px 16px",
        gap: 14,
      }}
    >
      <StrategyStat
        label="매수가"
        value={s.entryPrice != null ? `${Math.round(s.entryPrice).toLocaleString()}원` : "-"}
        color="var(--text)"
      />
      <div style={{ width: 1, background: "var(--border)" }} />
      <StrategyStat
        label="목표가"
        value={s.targetPrice !== null ? `${Math.round(s.targetPrice).toLocaleString()}원` : "-"}
        color="var(--up)"
        sub={s.targetPct !== null ? `+${s.targetPct.toFixed(1)}%` : undefined}
      />
      <div style={{ width: 1, background: "var(--border)" }} />
      <StrategyStat
        label="손절가"
        value={s.stopLossPrice !== null ? `${Math.round(s.stopLossPrice).toLocaleString()}원` : "-"}
        color="var(--down)"
        sub={s.stopLossPrice !== null ? "-4.0%" : undefined}
      />
      <div style={{ width: 1, background: "var(--border)" }} />
      <StrategyStat label="기대손익비" value={ratio !== null ? `${ratio.toFixed(1)} : 1` : "-"} color="var(--accent)" />
    </div>
  );
}

const dashboardButtonStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 11,
  fontWeight: 700,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--panel)",
  color: "var(--text)",
  cursor: "pointer",
};

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
  // 기술적 시그널은 이제 "3. 차트" 카드를 선택했을 때 그 우측 상세 뷰어
  // (ChartView, field-detail-modal.tsx) 안에서만 보여준다 — 모든 후보 카드
  // 아래 항상 "시그널: ..."로 반복 출력되던 예전 블록은 중복이라 제거했다
  // (사용자 요청: "불필요한 '시그널: ...' 텍스트 반복 제거"). 두 상위
  // 호출부(prediction-report.tsx/archive-prediction-detail.tsx)가 여전히
  // 이 prop을 넘기므로 시그니처는 유지하되 여기선 쓰지 않는다.
  void signals;

  const fields: MiniField[] = [
    { key: "material", num: 1, label: "재료", text: d.aiReasoning, verdict: d.verdicts.material },
    { key: "volume", num: 2, label: "거래량", text: d.volumeNote, verdict: d.verdicts.volume },
    { key: "chart", num: 3, label: "차트", text: d.chartNote, verdict: d.verdicts.chart },
    { key: "market", num: 4, label: "시황", text: d.marketContext, verdict: d.verdicts.marketContext },
    { key: "supply", num: 5, label: "수급", text: d.supplyDemand, verdict: d.verdicts.supplyDemand },
    { key: "financial", num: 6, label: "재무", text: d.financialSummary, verdict: d.verdicts.financial },
  ];

  const [activeKey, setActiveKey] = useState<FieldKey>("material");
  const [openField, setOpenField] = useState<FieldKey | null>(null);
  const [containerRef, width] = useContainerWidth<HTMLDivElement>();
  const isWide = width >= WIDE_BREAKPOINT;
  const active = fields.find((f) => f.key === activeKey) ?? fields[0];

  const nameBlock = (
    <span style={{ fontWeight: 800, fontSize: 13 }}>
      {d.name}
      {d.code && (
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)", marginLeft: 5 }}>
          ({d.code})
        </span>
      )}
    </span>
  );

  return (
    <div ref={containerRef} style={{ ...detailCardStyle, display: "flex", flexDirection: "column", gap: 14 }}>
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
              fontSize: 9.5,
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
              fontSize: 9.5,
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

      <StrategyStrip s={d.strategy} />

      <div style={{ display: "flex", flexDirection: isWide ? "row" : "column", gap: 14, alignItems: "stretch" }}>
        <div style={{ flex: isWide ? "0 0 40%" : "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {fields.map((f) => (
            <MiniFieldCard key={f.key} field={f} active={f.key === activeKey} onClick={() => setActiveKey(f.key)} />
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <button onClick={() => setOpenField("business")} style={dashboardButtonStyle} className="hover-accent-border">
              📄 사업 요약
            </button>
            <button onClick={() => setOpenField("financial")} style={dashboardButtonStyle} className="hover-accent-border">
              📊 재무 상세
            </button>
          </div>
        </div>

        <div
          style={{
            flex: isWide ? "0 0 60%" : "1 1 auto",
            minWidth: 0,
            background: "var(--panel2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              fontSize: 11,
              fontWeight: 800,
              color: "var(--accent)",
              fontFamily: "var(--mono)",
              letterSpacing: "0.04em",
            }}
          >
            {active.num}. {active.label}
            <VerdictChip verdict={active.verdict} />
          </div>
          <FieldDetailContent field={activeKey} code={d.code} name={d.name} reasoning={d.aiReasoning} />
        </div>
      </div>

      {series && series.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {markDays(series, d.strategy.stopLossPrice, d.strategy.targetPrice).map((p) => {
            const marked = p.hitStopToday || p.hitTargetToday;
            const markColor = p.hitStopToday ? "var(--down)" : p.hitTargetToday ? "var(--up)" : chgColorVar(p.changePct);
            return (
              <span
                key={p.date}
                title={p.date}
                style={{
                  fontSize: 9.5,
                  fontFamily: "var(--mono)",
                  fontWeight: 700,
                  padding: "3px 7px",
                  borderRadius: 6,
                  background: marked ? "transparent" : "var(--panel)",
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
          자체를 숨긴다. */}
      {series && series.length >= TRACKING_WINDOW_DAYS && (
        <div
          style={{
            fontSize: 10,
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
