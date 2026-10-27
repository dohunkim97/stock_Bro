"use client";

import { SAMPLE_SIGNALS } from "./sample-data";
import { Card, Badge, Metric } from "./ui";

// 바닥매수 신호 목록(샘플) — 재무 판단불가(fundStatus="unknown")인 종목은 "조건
// 충족" 배지를 붙이지 않는다. 확정 신호가 아니라는 걸 화면에서도 숨기지 않는다.
export function SignalList() {
  return (
    <div>
      {SAMPLE_SIGNALS.map((s) => (
        <div key={s.code} style={{ marginBottom: 8 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700 }}>{s.name}</span>
                <span style={{ fontSize: 12, color: "var(--dim)", fontFamily: "var(--mono)" }}>
                  {s.code} · 샘플 데이터
                </span>
              </div>
              {s.fundStatus === "pass" ? <Badge tone="ok">조건 충족</Badge> : <Badge tone="warn">재무 판단불가</Badge>}
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 10 }}>
              <Metric label="RSI(14)" value={s.rsi14.toFixed(1)} />
              <Metric label="60일 고점 대비" value={`${s.dropFromHighPct.toFixed(1)}%`} />
              <Metric label="매수 기준가" value={`${s.buyPrice.toLocaleString()}원`} />
              <Metric label="매수일" value={s.buyDate} />
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}
