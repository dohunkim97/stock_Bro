"use client";

import { useEffect, useState } from "react";
import { useGolgoo } from "./golgoo-context";
import { DetailCard } from "@/components/bro/detail-card";
import { BroChat } from "@/components/bro/bro-chat";
import { DuckLoader } from "@/components/ui/duck-loader";
import type { CandidateDetail } from "@/lib/candidate-detail";
import type { DailyChangePoint } from "@/lib/candidate-tracking";

// Slides open next to the chart when "🥚 골구 근거" is toggled on — fetches
// once per page load (cached in local state), shows the same DetailCard
// used on /bro (사업요약/AI 추천 근거/시황/수급/차트/재무/전략가이드 +
// 기술적 시그널) for this one stock, plus a live chat underneath so
// follow-up questions can go straight to Golgoo. GolgooEvidenceButton only
// renders when `available`, so this never mounts for an unrelated stock.
// 차트 스토리(①②③)는 더 이상 여기 목록으로 안 보여준다 — PriceChart가
// 각 포인트 바로 옆에 설명 박스를 직접 그려서, 옆 패널과 차트를 번갈아
// 보지 않아도 되게 바꿨다.
export function GolgooPanel({ code }: { code: string }) {
  const { available, open, signals, setOverlay } = useGolgoo();
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [series, setSeries] = useState<DailyChangePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!available || !open || fetched || loading) return;
    setLoading(true);
    setFailed(false);
    fetch(`/api/stock/golgoo-evidence?code=${code}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        setDetail(data.detail ?? null);
        setSeries(Array.isArray(data.series) ? data.series : []);
        setOverlay(
          Array.isArray(data.signals) ? data.signals : [],
          Array.isArray(data.levels) ? data.levels : [],
          Array.isArray(data.story) ? data.story : []
        );
        setFetched(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [available, open, fetched, loading, code, setOverlay]);

  if (!available || !open) return null;

  return (
    <div style={{ flex: "0 0 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 16,
          maxHeight: 560,
          overflowY: "auto",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>🥚 골구 근거 디테일</div>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
            <DuckLoader />
          </div>
        )}
        {!loading && failed && (
          <div style={{ fontSize: 12.5, color: "var(--faint)" }}>불러오지 못했어요. 다시 눌러주세요.</div>
        )}
        {!loading && !failed && detail && <DetailCard d={detail} series={series} signals={signals ?? undefined} />}
      </div>

      <div style={{ height: 420 }}>
        <BroChat />
      </div>
    </div>
  );
}
