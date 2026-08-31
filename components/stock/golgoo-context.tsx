"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { TechnicalSignal, SupportResistanceLevel, ChartStoryAnnotation } from "@/lib/technical-signals";

// Shared toggle state between GolgooEvidenceButton/GolgooPanel (candidate-
// gated AI 근거+대화) and ChartAnalysisButton/ChartAnalysisPanel (순수 차트
// 분석, 어떤 종목이든 가능 — Golgoo가 추천 중인 종목이 아니어도 켤 수 있음)
// and PriceChart (실제로 차트 위에 그리는 쪽) — 이 셋이 app/stock/page.tsx
// 안에서 서로 멀리 떨어져 있어서, 작은 context로 열림 상태와 데이터를
// 공유한다. 각 패널이 실제 fetch를 하고 여기로 결과를 publish하면,
// PriceChart는 둘 중 열려 있는 쪽 데이터를 그대로 읽기만 한다.
type GolgooCtxValue = {
  // 골구 근거 — Golgoo의 현재 예상종목일 때만 available.
  available: boolean;
  open: boolean;
  toggle: () => void;
  signals: TechnicalSignal[] | null;
  levels: SupportResistanceLevel[] | null;
  story: ChartStoryAnnotation[] | null;
  setOverlay: (signals: TechnicalSignal[], levels: SupportResistanceLevel[], story: ChartStoryAnnotation[]) => void;
  // 골구의 차트분석 — 후보 여부와 무관하게 항상 사용 가능.
  chartOpen: boolean;
  toggleChart: () => void;
  chartSignals: TechnicalSignal[] | null;
  chartLevels: SupportResistanceLevel[] | null;
  chartStory: ChartStoryAnnotation[] | null;
  setChartOverlay: (signals: TechnicalSignal[], levels: SupportResistanceLevel[], story: ChartStoryAnnotation[]) => void;
};

const GolgooContext = createContext<GolgooCtxValue | null>(null);

export function GolgooProvider({
  available,
  children,
}: {
  available: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState<TechnicalSignal[] | null>(null);
  const [levels, setLevels] = useState<SupportResistanceLevel[] | null>(null);
  const [story, setStory] = useState<ChartStoryAnnotation[] | null>(null);

  const [chartOpen, setChartOpen] = useState(false);
  const [chartSignals, setChartSignals] = useState<TechnicalSignal[] | null>(null);
  const [chartLevels, setChartLevels] = useState<SupportResistanceLevel[] | null>(null);
  const [chartStory, setChartStory] = useState<ChartStoryAnnotation[] | null>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const setOverlay = useCallback((s: TechnicalSignal[], l: SupportResistanceLevel[], st: ChartStoryAnnotation[]) => {
    setSignals(s);
    setLevels(l);
    setStory(st);
  }, []);

  const toggleChart = useCallback(() => setChartOpen((v) => !v), []);
  const setChartOverlay = useCallback(
    (s: TechnicalSignal[], l: SupportResistanceLevel[], st: ChartStoryAnnotation[]) => {
      setChartSignals(s);
      setChartLevels(l);
      setChartStory(st);
    },
    []
  );

  return (
    <GolgooContext.Provider
      value={{
        available,
        open,
        toggle,
        signals,
        levels,
        story,
        setOverlay,
        chartOpen,
        toggleChart,
        chartSignals,
        chartLevels,
        chartStory,
        setChartOverlay,
      }}
    >
      {children}
    </GolgooContext.Provider>
  );
}

export function useGolgoo(): GolgooCtxValue {
  const ctx = useContext(GolgooContext);
  if (!ctx) throw new Error("useGolgoo must be used within a GolgooProvider");
  return ctx;
}
