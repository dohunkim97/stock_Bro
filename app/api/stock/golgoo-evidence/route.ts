import { NextRequest, NextResponse } from "next/server";
import { getLatestPrediction, parsePredictionCandidates } from "@/lib/prediction-scoring";
import { getCandidateDetails, parseStoredCandidateDetails } from "@/lib/candidate-detail";
import { fetchKisChart } from "@/lib/kis-chart";
import {
  computeTechnicalSignals,
  findSupportResistanceLevels,
  buildChartStory,
  LONG_TERM_SIGNAL_CANDLES,
} from "@/lib/technical-signals";
import { getDailyChangeSeries } from "@/lib/candidate-tracking";

// Backs the "🥚 골구 근거" panel on the stock detail page — only ever called
// for a code that's actually one of Golgoo's current candidates (the button
// that triggers this doesn't render otherwise). Fetches the deep candle
// history once and derives everything else (signals, support/resistance,
// day-by-day tracking) from that single fetch, same as
// components/bro/prediction-report.tsx does for the live report.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const latest = await getLatestPrediction();
  if (!latest) return NextResponse.json({ error: "no prediction" }, { status: 404 });

  const candidates = parsePredictionCandidates(latest.candidates);
  const candidate = candidates.find((c) => c.code === code);
  if (!candidate) return NextResponse.json({ error: "not a current candidate" }, { status: 404 });

  // 리포트(components/bro/prediction-report.tsx)와 똑같이 생성 시점에 한 번
  // 저장해둔 근거를 그대로 쓴다 — 이 패널을 열 때마다 실시간으로 다시 계산해
  // 값이 나타났다 사라졌다 바뀌는 걸 막기 위함. 저장된 값에 이 종목이 없으면
  // (마이그레이션 이전 옛 레코드 등) 그때만 즉석에서 계산한다.
  const stored = parseStoredCandidateDetails(latest.details)?.find((d) => d.code === code);

  const [candles, details] = await Promise.all([
    fetchKisChart(code, "D", LONG_TERM_SIGNAL_CANDLES),
    stored ? Promise.resolve([stored]) : getCandidateDetails([candidate]),
  ]);

  return NextResponse.json({
    detail: details[0] ?? null,
    signals: computeTechnicalSignals(candles),
    levels: findSupportResistanceLevels(candles),
    story: buildChartStory(candles),
    series: getDailyChangeSeries(candles, latest.forDate),
  });
}
