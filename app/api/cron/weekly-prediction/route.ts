import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyPrediction } from "@/lib/weekly-prediction";

export const maxDuration = 60;

// Fires daily on weekdays, after close (see vercel.json) — always targets
// the upcoming week and upserts by forWeekKey, so this keeps refining the
// SAME prediction as fresh sources (news issues, Telegram tips) accumulate
// through the week, rather than only writing once on Friday.
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
