import { NextRequest, NextResponse } from "next/server";
import { fetchKisChart, type ChartPeriod } from "@/lib/kis-chart";

export const maxDuration = 15;

const VALID_PERIODS: ChartPeriod[] = ["D", "W", "M"];

// Client-fetched (not server-rendered with the rest of the stock page) —
// the candlestick library needs a real DOM canvas, so this stays a
// client-side fetch + render rather than server-side data + hydration.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code가 필요해요" }, { status: 400 });

  const periodParam = req.nextUrl.searchParams.get("period");
  const period: ChartPeriod = VALID_PERIODS.includes(periodParam as ChartPeriod) ? (periodParam as ChartPeriod) : "D";

  const candles = await fetchKisChart(code, period);
  return NextResponse.json({ candles });
}
