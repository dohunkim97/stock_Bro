import { NextRequest, NextResponse } from "next/server";
import { getLatestPrediction, parsePredictionCandidates } from "@/lib/prediction-scoring";
import { getCandidateDetails } from "@/lib/candidate-detail";
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

  const [candles, details] = await Promise.all([
    fetchKisChart(code, "D", LONG_TERM_SIGNAL_CANDLES),
    getCandidateDetails([candidate]),
  ]);

  return NextResponse.json({
    detail: details[0] ?? null,
    signals: computeTechnicalSignals(candles),
    levels: findSupportResistanceLevels(candles),
    story: buildChartStory(candles),
    series: getDailyChangeSeries(candles, latest.forDate),
  });
}
