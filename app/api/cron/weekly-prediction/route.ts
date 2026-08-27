import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyPrediction } from "@/lib/weekly-prediction";

export const maxDuration = 60;

// Fires daily on weekdays, after close (see vercel.json) — publishes a
// fresh 5-거래일 pick sheet for TODAY (forDate), upserting only to guard
// against a same-day retry. Each day's row is permanent; it doesn't get
// overwritten by the next day's run, so 기록보관소 can keep every past
// day's own cumulative-return tracking independent of later picks.
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
