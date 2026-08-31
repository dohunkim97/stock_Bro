import { NextRequest, NextResponse } from "next/server";
import { fetchKisChart } from "@/lib/kis-chart";
import {
  computeTechnicalSignals,
  findSupportResistanceLevels,
  buildChartStory,
  LONG_TERM_SIGNAL_CANDLES,
} from "@/lib/technical-signals";

// Backs "📊 골구 차트분석" — unlike app/api/stock/golgoo-evidence (which
// requires the stock to be one of Golgoo's current picks, since it also
// pulls an LLM-written 사업요약/AI 추천 근거), this only needs real candle
// data, so it works for any stock. Same underlying signal/level/story
// functions as golgoo-evidence — just without the candidate lookup.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const candles = await fetchKisChart(code, "D", LONG_TERM_SIGNAL_CANDLES);
  if (candles.length === 0) return NextResponse.json({ error: "no chart data" }, { status: 404 });

  return NextResponse.json({
    signals: computeTechnicalSignals(candles),
    levels: findSupportResistanceLevels(candles),
    story: buildChartStory(candles),
  });
}
