"use client";

import type { SampleSignal, Criterion } from "./sample-data";
import { Card, Badge } from "./ui";

const STATUS_LABEL: Record<Criterion["status"], string> = { pass: "충족", fail: "미충족", unknown: "데이터 없음" };
const STATUS_TONE: Record<Criterion["status"], "ok" | "warn" | "dim"> = { pass: "ok", fail: "warn", unknown: "dim" };

function CriterionRow({ c }: { c: Criterion }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</div>
        <div style={{ fontSize: 12, color: "var(--dim)", fontFamily: "var(--mono)", marginTop: 2 }}>
          측정값 {c.value} · 기준 {c.threshold}
        </div>
        {c.note && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>{c.note}</div>}
      </div>
      <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
    </div>
  );
}

// 종목 행을 클릭했을 때 그 바로 아래 펼쳐지는 상세 설명 — 전부 샘플 값이며, 데이터가
// 없는 항목은 임의로 채우지 않고 "데이터 없음"으로 표시한다(sample-data.ts의
// Criterion.status="unknown" 그대로 노출). 신호 발생일(buyDate)과 최초 발견일
// (firstSeenDate)을 구분해서 보여준다 — 같은 날일 수도, 다를 수도 있다(샘플).
export function SignalDetail({ signal }: { signal: SampleSignal }) {
  const technical = signal.criteria.filter((c) => ["rsi14", "dropFromHighPct", "bullish"].includes(c.key));
  const financial = signal.criteria.filter((c) => ["per", "debtRatio", "reserveRatio"].includes(c.key));
  const unmet = signal.criteria.filter((c) => c.status !== "pass");

  return (
    <div style={{ marginTop: -2, marginBottom: 8 }}>
      <Card>
        <div
          style={{
            fontSize: 11,
            color: "var(--up)",
            background: "var(--up-soft)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 10px",
            marginBottom: 12,
          }}
        >
          샘플 데이터 — 실제 신호·측정값이 아닙니다. 데이터가 없는 항목은 추정하지 않고 "데이터 없음"으로 표시합니다.
        </div>

        <div style={{ display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>신호 발생일</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{signal.buyDate}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>최초 발견일</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{signal.firstSeenDate}</div>
            {signal.firstSeenDate !== signal.buyDate && (
              <div style={{ fontSize: 11, color: "var(--dim)" }}>이전에도 신호를 낸 적 있는 종목(샘플)</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>매수 기준가</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{signal.buyPrice.toLocaleString()}원</div>
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>기술적 신호</div>
        {technical.map((c) => (
          <CriterionRow key={c.key} c={c} />
        ))}

        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 14, marginBottom: 6 }}>재무 필터</div>
        {financial.map((c) => (
          <CriterionRow key={c.key} c={c} />
        ))}

        <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--panel2)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>종합 결과</div>
          <div style={{ fontSize: 13 }}>{signal.finalReason}</div>
          {unmet.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 6 }}>
              미충족/확인불가 기준: {unmet.map((c) => c.label).join(", ")}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 10 }}>
          성과 비교 데이터: 아직 없음(샘플 — 실제 성과는 보유 기간이 지나야 확정됩니다)
        </div>
      </Card>
    </div>
  );
}
