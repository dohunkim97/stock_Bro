"use client";

// 골구2(바닥매수 기법 독립 실험) 페이지 — 상세 설명·선정 기준 범례 UI 승인 범위.
// 기존 /bro(골구) 페이지·components/bro/*·lib/bottom-fish-scan.ts 등은 이 파일에서
// 전혀 import하지 않는다. 전부 components/golgoo2/sample-data.ts의 하드코딩된
// 샘플만 사용 — Prisma/KIS/data.go.kr 실제 연결은 별도 승인 대상.

import { useState } from "react";
import { SignalList } from "@/components/golgoo2/signal-list";
import { ComparisonReport } from "@/components/golgoo2/comparison-report";
import { CriteriaLegend } from "@/components/golgoo2/criteria-legend";
import { Badge } from "@/components/golgoo2/ui";
import { SAMPLE_SIGNALS } from "@/components/golgoo2/sample-data";

export default function Golgoo2Page() {
  const [tab, setTab] = useState<"signal" | "compare">("signal");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const selected = SAMPLE_SIGNALS.find((s) => s.code === selectedCode) ?? null;

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 24px 60px" }}>
      {/* 데스크톱(900px 이상)에서는 본문+우측 범례 2단, 그 아래는 1단(모바일 포함) —
          별도 breakpoint 관례가 없는 저장소라 이 페이지 전용 클래스로 최소한만 정의. */}
      <style>{`
        .golgoo2-layout { display: block; }
        .golgoo2-legend { margin-top: 20px; }
        @media (min-width: 900px) {
          .golgoo2-layout { display: grid; grid-template-columns: 1fr 320px; gap: 20px; align-items: start; }
          .golgoo2-legend { margin-top: 0; position: sticky; top: 76px; }
        }
      `}</style>

      <div
        style={{
          fontSize: 12,
          color: "var(--up)",
          background: "var(--up-soft)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 12px",
          marginBottom: 14,
        }}
      >
        샘플 데이터 화면입니다. 표시된 종목과 수치, 성과는 실제 바닥매수 스캔 결과가 아닙니다.
      </div>

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

      {tab === "signal" ? (
        <div className="golgoo2-layout" style={{ marginTop: 16 }}>
          <div>
            <SignalList selectedCode={selectedCode} onSelect={setSelectedCode} />
          </div>
          <div className="golgoo2-legend">
            <CriteriaLegend selected={selected} />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <ComparisonReport />
        </div>
      )}
    </main>
  );
}
