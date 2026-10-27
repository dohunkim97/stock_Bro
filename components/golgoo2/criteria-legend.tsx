"use client";

import { CRITERIA_DEFINITIONS, type SampleSignal } from "./sample-data";
import { Card, Badge } from "./ui";

const STATUS_LABEL = { pass: "충족", fail: "미충족", unknown: "데이터 없음" } as const;
const STATUS_TONE = { pass: "ok", fail: "warn", unknown: "dim" } as const;

// 선정 기준 범례 — 종목을 하나도 안 골랐을 때는 기준 정의만, 종목을 클릭해 고르면
// 그 종목의 실제(샘플) 값을 기준 옆에 같이 보여준다. 기존 로직(lib/bottom-fish-scan.ts)에
// 배점 체계가 없어 "배점" 칸은 전부 "배점 없음"으로 고정 표시한다 — 임의로 점수를
// 만들지 않는다.
export function CriteriaLegend({ selected }: { selected: SampleSignal | null }) {
  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>종목 선정 기준</div>
      <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 12 }}>
        {selected ? `${selected.name}(${selected.code}) 기준 — 샘플 값` : "종목을 클릭하면 해당 종목의 값과 비교해 보여줍니다"}
      </div>

      {CRITERIA_DEFINITIONS.map((def) => {
        const matched = selected?.criteria.find((c) => c.key === def.key);
        return (
          <div key={def.key} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{def.label}</div>
            <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>충족 조건: {def.condition}</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>{def.scoreNote}</div>
            {matched && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>측정값: {matched.value}</span>
                <Badge tone={STATUS_TONE[matched.status]}>{STATUS_LABEL[matched.status]}</Badge>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
