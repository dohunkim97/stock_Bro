"use client";

// 골구2(바닥매수 기법 독립 실험) 페이지 — 1단계(화면 작업) 승인 범위.
// 기존 /bro(골구) 페이지·components/bro/*·lib/bottom-fish-scan.ts 등은 이 파일에서
// 전혀 import하지 않는다. 전부 components/golgoo2/sample-data.ts의 하드코딩된
// 샘플만 사용 — Prisma/KIS/data.go.kr 실제 연결은 2~3단계 이후 별도 승인 대상.

import { useState } from "react";
import { SignalList } from "@/components/golgoo2/signal-list";
import { ComparisonReport } from "@/components/golgoo2/comparison-report";
import { Badge } from "@/components/golgoo2/ui";

export default function Golgoo2Page() {
  const [tab, setTab] = useState<"signal" | "compare">("signal");

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "26px 24px 60px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>골구2 · 바닥매수 기법 실험</h1>
        <Badge tone="warn">개발 중</Badge>
      </div>
      <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 4 }}>
        기존 골구(뉴스 기반 추천)와 별개로 운영되는 독립 기법입니다 — 기존 종목예상·성과 기록에는 영향을 주지
        않습니다.
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 20, borderBottom: "1px solid var(--border)" }}>
        {([
          ["signal", "바닥매수 신호"],
          ["compare", "성과 비교"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 14px",
              border: 0,
              background: "transparent",
              color: tab === key ? "var(--text)" : "var(--dim)",
              fontWeight: tab === key ? 700 : 500,
              borderBottom: tab === key ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>{tab === "signal" ? <SignalList /> : <ComparisonReport />}</div>
    </main>
  );
}
