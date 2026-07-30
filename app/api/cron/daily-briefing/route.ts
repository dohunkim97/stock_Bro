import { NextRequest, NextResponse } from "next/server";
import { generateDailyBriefing } from "@/lib/market-briefing";
import { todayISO } from "@/lib/dates";

export const maxDuration = 60;

// Runs a few minutes after /api/cron/sync-market (see vercel.json) so the
// day's KIS-sourced ranking data is already in the DB by the time this reads it.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await generateDailyBriefing(todayISO());
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "브리핑 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
