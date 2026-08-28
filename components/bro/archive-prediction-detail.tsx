"use client";

import { useEffect, useState } from "react";
import { renderBold } from "@/components/ui/rich-text";
import type { CandidateDetail } from "@/lib/candidate-detail";
import type { SectorPrediction, CandidatePrediction } from "@/lib/prediction-scoring";
import type { DailyChangePoint } from "@/lib/candidate-tracking";
import type { TechnicalSignal } from "@/lib/technical-signals";
import { blockStyle, blockHeaderStyle, badgeStyle, blockLabelStyle, DetailCard } from "./detail-card";

type CandidateWithSeries = CandidatePrediction & { series: DailyChangePoint[] };
type DetailWithSignals = CandidateDetail & { signals: TechnicalSignal[] };

// 기록보관소 예상리포트 카드를 열었을 때 보여주는 상세 뷰 — 요약/섹터/누적
// 수익률은 (LLM·외부 API 호출 없이) 이미 서버에서 계산돼 props로 들어와
// 있어서 바로 보여주고, 무거운 종목별 심층 근거(사업요약·시황·수급·재무·
// 전략가이드)와 기술적 시그널만 모달이 실제로 열릴 때
// /api/bro/prediction-detail에서 그때그때 불러온다 — 오늘의 라이브 리포트
// (prediction-report.tsx)와 똑같은 DetailCard로 보여준다.
export function ArchivePredictionDetail({
  forDate,
  summary,
  sectors,
  candidates,
}: {
  forDate: string;
  summary: string;
  sectors: SectorPrediction[];
  candidates: CandidateWithSeries[];
}) {
  const [details, setDetails] = useState<DetailWithSignals[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    setFailed(false);
    fetch(`/api/bro/prediction-detail?forDate=${forDate}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled) setDetails(Array.isArray(data.candidates) ? data.candidates : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [forDate]);

  const seriesByName = new Map(candidates.map((c) => [c.name, c.series]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={blockStyle}>
        <div style={blockHeaderStyle}>
          <span style={badgeStyle}>1</span>
          <span style={blockLabelStyle}>내용</span>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", margin: 0 }}>{renderBold(summary)}</p>
      </div>

      {sectors.length > 0 && (
        <div style={blockStyle}>
          <div style={blockHeaderStyle}>
            <span style={badgeStyle}>2</span>
            <span style={blockLabelStyle}>주목 섹터</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sectors.map((s) => (
              <div key={s.name} style={{ fontSize: 12, lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700, color: "var(--accent)" }}>{s.name}</span>
                <span style={{ color: "var(--dim)" }}> — {renderBold(s.reasoning)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {candidates.length > 0 && (
        <div style={blockStyle}>
          <div style={blockHeaderStyle}>
            <span style={badgeStyle}>3</span>
            <span style={blockLabelStyle}>종목 근거</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {details
              ? details.map((d) => (
                  <DetailCard key={d.name} d={d} series={seriesByName.get(d.name)} signals={d.signals} />
                ))
              : failed
                ? <div style={{ fontSize: 12, color: "var(--faint)" }}>종목 상세 정보를 불러오지 못했어요.</div>
                : candidates.map((c) => (
                    <div key={c.name} style={{ fontSize: 12, color: "var(--dim)", padding: "10px 0" }}>
                      <span style={{ fontWeight: 700, color: "var(--text)" }}>{c.name}</span> 상세 정보 불러오는 중...
                    </div>
                  ))}
          </div>
        </div>
      )}
    </div>
  );
}
