"use client";

import { useEffect, useState } from "react";
import { renderBold } from "@/components/ui/rich-text";
import type { PortfolioAdvice } from "@/lib/portfolio-advisor";

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
  border: "1px solid var(--border2)",
  borderRadius: 14,
  padding: 20,
};

// AI 골구 리밸런싱 어드바이저 — 무거운(LLM + 시장데이터) 계산이라 페이지
// 서버 렌더에 끼워넣지 않고, 카드가 마운트될 때 클라이언트에서
// /api/portfolio/advice를 호출한다(기록보관소의 ArchivePredictionDetail과
// 같은 지연 로딩 패턴). 실패해도(예: API 크레딧 소진) 페이지 전체가 깨지지
// 않고 이 카드만 재시도 버튼과 함께 에러 상태를 보여준다.
export function AdvisorCard() {
  const [advice, setAdvice] = useState<PortfolioAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/advice", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "분석을 가져오지 못했어요");
        return;
      }
      setAdvice(data);
    } catch {
      setError("분석을 가져오지 못했어요");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: "linear-gradient(135deg, var(--accent), var(--up))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0d13",
              fontWeight: 800,
              fontSize: 11,
            }}
          >
            G
          </div>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>AI 골구 리밸런싱 어드바이저</span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            border: "1px solid var(--border)",
            background: "var(--panel)",
            color: "var(--dim)",
            borderRadius: 7,
            padding: "4px 10px",
            fontSize: 11,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "분석 중..." : "다시 분석"}
        </button>
      </div>

      {loading && !advice && (
        <div style={{ fontSize: 12.5, color: "var(--faint)" }}>포트폴리오 분석하는 중...</div>
      )}

      {error && (
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>{error}</div>
      )}

      {advice && (
        <div>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", margin: "0 0 12px" }}>
            {renderBold(advice.summary)}
          </p>
          {advice.suggestions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {advice.suggestions.map((s, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text)" }}>{renderBold(s.action)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 3 }}>{renderBold(s.reason)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
