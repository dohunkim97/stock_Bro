"use client";

import { useEffect, useState } from "react";
import { useGolgoo } from "./golgoo-context";
import { StoryList } from "./golgoo-panel";
import { DuckLoader } from "@/components/ui/duck-loader";

// Light counterpart to GolgooPanel — no DetailCard (there's no AI 추천
// 근거 to show for a stock Golgoo never picked) and no chat, just the
// support/resistance level summary + numbered chart story, matching the
// ①②③ markers ChartAnalysisButton's toggle draws on the chart.
export function ChartAnalysisPanel({ code }: { code: string }) {
  const { chartOpen, chartLevels, chartStory, setChartOverlay } = useGolgoo();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!chartOpen || fetched || loading) return;
    setLoading(true);
    setFailed(false);
    fetch(`/api/stock/chart-analysis?code=${code}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        setChartOverlay(
          Array.isArray(data.signals) ? data.signals : [],
          Array.isArray(data.levels) ? data.levels : [],
          Array.isArray(data.story) ? data.story : []
        );
        setFetched(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [chartOpen, fetched, loading, code, setChartOverlay]);

  if (!chartOpen) return null;

  return (
    <div style={{ flex: "0 0 320px", minWidth: 0 }}>
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
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>📊 골구 차트분석</div>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
            <DuckLoader />
          </div>
        )}
        {!loading && failed && (
          <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 10 }}>
            불러오지 못했어요. 다시 눌러주세요.
          </div>
        )}
        {!loading && !failed && chartLevels && chartLevels.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 10 }}>
            분석할 만한 지지/저항 패턴을 찾지 못했어요.
          </div>
        )}
        {!loading && !failed && chartLevels && chartLevels.length > 0 && (
          <>
            <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>
              차트 위 실선은 지지/저항선, 굵은 강조선이 가장 신뢰도 높은 핵심 기준선이에요.
            </div>
            {chartStory && <StoryList story={chartStory} />}
          </>
        )}
      </div>
    </div>
  );
}
