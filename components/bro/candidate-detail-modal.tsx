"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { DuckLoader } from "@/components/ui/duck-loader";
import { chgColorVar, formatChg } from "@/lib/format";
import type { CandidateDetail } from "@/lib/candidate-detail";

const rowStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
};

const fieldLineStyle: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.7,
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

function DetailCard({ d }: { d: CandidateDetail }) {
  return (
    <div style={{ ...rowStyle, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>
          {d.name}
          {d.code && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--faint)", marginLeft: 5 }}>
              ({d.code})
            </span>
          )}
        </span>
        {d.themeTags.length > 0 && (
          <span style={{ color: "var(--faint)" }}>|</span>
        )}
        {d.themeTags.map((t) => (
          <span
            key={t}
            style={{
              fontSize: 11,
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
              fontSize: 11,
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

      <Field label="사업 한 줄 요약" value={d.businessSummary} />
      <Field label="AI 추천 근거" value={d.aiReasoning} />
      <Field label="시황" value={d.marketContext} />
      <Field label="수급 상태" value={d.supplyDemand} />
      <Field label="차트" value={d.chartNote} />
      <Field label="재무요약" value={d.financialSummary} />

      <div style={fieldLineStyle}>
        <span style={fieldLabelStyle}>■ 전략 가이드:</span>
        <div style={{ paddingLeft: 14, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          <div>
            - 목표 구간:{" "}
            {d.strategy.targetPrice !== null ? (
              <>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                  {Math.round(d.strategy.targetPrice).toLocaleString()}원
                </span>{" "}
                {d.strategy.targetPct !== null && (
                  <span style={{ fontFamily: "var(--mono)", color: chgColorVar(d.strategy.targetPct) }}>
                    (기대수익 {formatChg(d.strategy.targetPct)})
                  </span>
                )}
              </>
            ) : (
              "데이터 부족"
            )}
          </div>
          <div>
            - 지지/손절선:{" "}
            {d.strategy.stopLossPrice !== null ? (
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                {Math.round(d.strategy.stopLossPrice).toLocaleString()}원
              </span>
            ) : (
              "데이터 부족"
            )}{" "}
            이탈 시 비중 축소
          </div>
        </div>
      </div>
    </div>
  );
}

// "더보기" 버튼 — 예상 리포트(PredictionReport) 3번 블록의 압축된 후보 목록
// 아래 빈 공간에 붙어서, 클릭하면 종목별 심층 카드(사업요약/시황/수급/차트/
// 재무/전략가이드)를 모달로 보여준다. 수급·차트·재무·전략가이드는 전부
// 실데이터 계산값이고(app/api/bro/candidate-detail), 사업요약·시황만 AI가
// 채운다 — 열 때마다 새로 fetch하지 않도록 한 번 불러오면 세션 동안 캐시.
export function CandidateDetailModal() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<CandidateDetail[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleOpen() {
    setOpen(true);
    if (details || loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/bro/candidate-detail");
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setDetails(data.details ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        style={{
          width: "100%",
          border: "1px dashed var(--border2)",
          borderRadius: 12,
          background: "transparent",
          color: "var(--faint)",
          fontSize: 12.5,
          fontWeight: 600,
          padding: "14px 0",
          cursor: "pointer",
        }}
      >
        더보기 — 종목별 사업요약·시황·수급·차트·재무·전략까지 자세히 보기
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="종목 근거 상세">
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
            <DuckLoader />
          </div>
        )}
        {!loading && error && (
          <div style={{ fontSize: 13, color: "var(--faint)", textAlign: "center", padding: "20px 0" }}>
            불러오지 못했어요. 잠시 후 다시 열어주세요.
          </div>
        )}
        {!loading && !error && details && details.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--faint)", textAlign: "center", padding: "20px 0" }}>
            이번 주 예상 종목이 아직 없어요.
          </div>
        )}
        {!loading && !error && details && details.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {details.map((d) => (
              <DetailCard key={d.name} d={d} />
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
