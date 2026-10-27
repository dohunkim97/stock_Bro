"use client";

import { SAMPLE_SIGNALS } from "./sample-data";
import { Card, Badge, Metric } from "./ui";
import { SignalDetail } from "./signal-detail";

// 바닥매수 신호 목록(샘플) — 종목 행을 클릭하면 바로 아래에 상세 설명이 펼쳐진다.
// 다른 종목을 클릭하면 선택이 그쪽으로 전환된다(동시에 둘 이상 펼치지 않음). 선택
// 상태는 상위(app/golgoo2/page.tsx)와 공유해 우측 범례 패널도 같은 종목을 비춘다.
export function SignalList({
  selectedCode,
  onSelect,
}: {
  selectedCode: string | null;
  onSelect: (code: string | null) => void;
}) {
  return (
    <div>
      {SAMPLE_SIGNALS.map((s) => {
        const isOpen = selectedCode === s.code;
        return (
          <div key={s.code} style={{ marginBottom: 8 }}>
            <div onClick={() => onSelect(isOpen ? null : s.code)} style={{ cursor: "pointer" }}>
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
                  <Metric label="신호 발생일" value={s.buyDate} />
                </div>
              </Card>
            </div>
            {isOpen && <SignalDetail signal={s} />}
          </div>
        );
      })}
    </div>
  );
}
