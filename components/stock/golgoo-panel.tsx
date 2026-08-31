"use client";

import { useEffect, useState } from "react";
import { useGolgoo } from "./golgoo-context";
import { DetailCard } from "@/components/bro/detail-card";
import { BroChat } from "@/components/bro/bro-chat";
import { DuckLoader } from "@/components/ui/duck-loader";
import type { CandidateDetail } from "@/lib/candidate-detail";
import type { DailyChangePoint } from "@/lib/candidate-tracking";
import type { ChartStoryAnnotation } from "@/lib/technical-signals";

const STEP_CIRCLE = ["①", "②", "③", "④", "⑤"];

// 차트 위 ①②③ 마커는 짧은 라벨만 보여줄 수 있어서(hover 툴팁이 없는
// lightweight-charts 마커 특성상), 같은 번호의 전체 설명은 여기 목록으로
// 따로 보여준다 — 번호로 차트 마커와 1:1 매칭된다.
export function StoryList({ story }: { story: ChartStoryAnnotation[] }) {
  if (story.length === 0) return null;
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--faint)", marginBottom: 8 }}>
        차트 스토리 (핵심 기준선 흐름)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {story.map((ev) => {
          const color = ev.direction === "bullish" ? "var(--up)" : ev.direction === "bearish" ? "var(--down)" : "var(--accent)";
          return (
            <div key={ev.stepNumber} style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 800, color, flexShrink: 0 }}>{STEP_CIRCLE[ev.stepNumber - 1] ?? ev.stepNumber}</span>
              <div>
                <span style={{ fontWeight: 700, color }}>{ev.badgeLabel}</span>
                <span style={{ color: "var(--faint)", marginLeft: 6, fontFamily: "var(--mono)" }}>{ev.date}</span>
                <div style={{ color: "var(--dim)", marginTop: 2 }}>{ev.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Slides open next to the chart when "🥚 골구 근거" is toggled on — fetches
// once per page load (cached in local state), shows the same DetailCard
// used on /bro (사업요약/AI 추천 근거/시황/수급/차트/재무/전략가이드 +
// 기술적 시그널) for this one stock, plus a live chat underneath so
// follow-up questions can go straight to Golgoo. GolgooEvidenceButton only
// renders when `available`, so this never mounts for an unrelated stock.
export function GolgooPanel({ code }: { code: string }) {
  const { available, open, signals, story, setOverlay } = useGolgoo();
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
        {!loading && !failed && story && <StoryList story={story} />}
      </div>

      <div style={{ height: 420 }}>
        <BroChat />
      </div>
    </div>
  );
}
