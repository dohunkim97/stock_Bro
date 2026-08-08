import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyPrediction } from "@/lib/weekly-prediction";

export const maxDuration = 60;

// Fires once a week, Friday close (see vercel.json) — after the day's
// close briefing/sync so this week's data is fully in before generating
// a prediction FOR next week.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await generateWeeklyPrediction();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "예측 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
