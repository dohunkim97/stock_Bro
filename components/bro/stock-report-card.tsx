"use client";

import { useEffect, useState } from "react";
import type { CandidateDetail } from "@/lib/candidate-detail";
import type { BusinessDetail } from "@/lib/field-detail";
import type { TechnicalSignal } from "@/lib/technical-signals";
import { DetailCard } from "./detail-card";

// 골구 워크스페이스 좌측 피드에 쌓이는 카드 한 장의 데이터 — 6대 매수 기준
// (DetailCard, 시황/거래량/차트/재료/수급/재무 + 매수타이밍)은 카드가 생길
// 때 이미 계산돼 있지만, 기업분석(BM/지배구조)은 DART 왕복이 느려서(최대
// 수십 초) 카드 목록 자체를 그만큼 늦추지 않도록 null로 시작해 이 카드가
// 마운트된 뒤 따로 불러온다.
export type CardPayload = {
  detail: CandidateDetail;
  business: BusinessDetail | null;
  signals?: TechnicalSignal[];
};

// CompanyAnalysis(로컬 기업분석 프로그램 결과)가 있으면 종합 결론
// (master_analyst_final_verdict)을, 없으면 DART+LLM 요약(overview/products/
// newBusiness)을 그대로 불렛으로 — lib/field-detail.ts의 getBusinessDetail이
// 소스에 따라 둘 중 하나만 채워주므로 여기서 통일해서 뽑는다.
function summarizeBusiness(b: BusinessDetail): string[] {
  if (b.companyAnalysis) {
    try {
      const parsed = JSON.parse(b.companyAnalysis.rawJson) as Record<string, unknown>;
      const verdict = parsed.master_analyst_final_verdict;
      if (Array.isArray(verdict)) {
        const lines = verdict.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
        if (lines.length > 0) return lines;
      }
    } catch {
      // rawJson이 깨져 있으면 아래 DART 요약 필드로 폴백
    }
  }
  return [b.overview, b.products, b.newBusiness].filter((s) => s && s.trim().length > 0);
}

function useLazyBusinessDetail(
  code: string | undefined,
  name: string,
  initial: BusinessDetail | null
): BusinessDetail | null {
  const [business, setBusiness] = useState<BusinessDetail | null>(initial);

  useEffect(() => {
    if (business !== null || !code) return;
    let cancelled = false;
    fetch(`/api/bro/field-detail?field=business&code=${code}&name=${encodeURIComponent(name)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setBusiness(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return business;
}

export function StockReportCard({
  payload,
  onRemove,
}: {
  payload: CardPayload;
  onRemove?: () => void;
}) {
  const { detail } = payload;
  const business = useLazyBusinessDetail(detail.code, detail.name, payload.business);
  const bmLines = business ? summarizeBusiness(business) : [];

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
      {onRemove && (
        <button
          onClick={onRemove}
          title="카드 닫기"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "1px solid var(--border)",
            background: "var(--panel)",
            color: "var(--faint)",
            cursor: "pointer",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      )}

      <div
        style={{
          background: "var(--panel2)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "14px 40px 14px 14px",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6, color: "var(--accent)" }}>
          🏢 기업분석 — BM/지배구조
          {business?.reportName && (
            <span style={{ fontWeight: 400, fontSize: 10.5, color: "var(--faint)", marginLeft: 6 }}>
              ({business.reportName})
            </span>
          )}
        </div>
        {!business ? (
          <div style={{ fontSize: 11.5, color: "var(--faint)" }}>불러오는 중…</div>
        ) : bmLines.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.65, color: "var(--text)" }}>
            {bmLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--faint)" }}>기업분석 정보를 찾지 못했어요.</div>
        )}
      </div>

      <DetailCard d={detail} signals={payload.signals} />
    </div>
  );
}
