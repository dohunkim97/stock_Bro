"use client";

import { SAMPLE_STRATEGY_STATS, SAMPLE_OPEN_POSITIONS } from "./sample-data";
import { Card, StatCard, Badge } from "./ui";

// 골구(기존) vs 골구2(바닥매수) 성과 비교 리포트 — 전부 샘플 값.
// 실제 집계는 기존 PredictionOutcome/BottomFishOutcome 원본을 그대로 두고,
// 같은 수수료·슬리피지 가정을 적용하는 별도 계산 레이어에서 만들 예정(2~3단계,
// 별도 승인). 이 화면은 그 레이아웃만 먼저 확정하기 위한 것이다.
export function ComparisonReport() {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: "var(--up)",
          background: "var(--up-soft)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 12px",
          marginBottom: 16,
        }}
      >
        이 비교 리포트는 레이아웃 확인용 샘플입니다 — 실제 거래 기록·PredictionOutcome·BottomFishOutcome 데이터에
        연결돼 있지 않습니다. 기존 골구의 성과 계산 로직과 데이터는 이 화면과 무관하게 그대로입니다.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {SAMPLE_STRATEGY_STATS.map((s) => (
          <Card key={s.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{s.label}</span>
              <Badge tone="dim">샘플</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <StatCard label="승률" value={`${s.winRate.toFixed(1)}%`} tone={s.winRate >= 50 ? "up" : "down"} />
              <StatCard label="거래 횟수" value={`${s.tradeCount}건`} />
              <StatCard label="평균 수익률" value={`${s.avgReturnPct >= 0 ? "+" : ""}${s.avgReturnPct.toFixed(1)}%`} tone={s.avgReturnPct >= 0 ? "up" : "down"} />
              <StatCard label="누적 수익률" value={`${s.cumulativeReturnPct >= 0 ? "+" : ""}${s.cumulativeReturnPct.toFixed(1)}%`} tone={s.cumulativeReturnPct >= 0 ? "up" : "down"} />
              <StatCard label="최대 손실(MDD)" value={`${s.maxDrawdownPct.toFixed(1)}%`} tone="down" />
            </div>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 20, fontSize: 13, fontWeight: 700, color: "var(--dim)" }}>미청산 종목 평가손익(샘플)</div>
      <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4, marginBottom: 10 }}>
        5거래일 보유 기간이 아직 안 지난 종목 — 확정 수익률이 아니라 현재 시점 평가손익입니다.
      </div>
      {SAMPLE_OPEN_POSITIONS.map((p) => (
        <div
          key={p.code}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 6,
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {p.name} <span style={{ fontSize: 12, color: "var(--dim)", fontFamily: "var(--mono)" }}>{p.code}</span>
          </span>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: p.unrealizedPct >= 0 ? "var(--up)" : "var(--down)" }}>
            {p.unrealizedPct >= 0 ? "+" : ""}
            {p.unrealizedPct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
