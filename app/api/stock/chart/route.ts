import { NextRequest, NextResponse } from "next/server";
import { fetchKisChart, type ChartPeriod } from "@/lib/kis-chart";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const period = searchParams.get("period");

  if (!code || code.length !== 6) {
    return NextResponse.json({ error: "잘못된 종목코드예요" }, { status: 400 });
  }
  const normalizedPeriod: ChartPeriod = period === "W" || period === "M" ? period : "D";

  const candles = await fetchKisChart(code, normalizedPeriod);
  return NextResponse.json({ candles });
}
