import { NextRequest, NextResponse } from "next/server";
import { generateBriefing, BRIEFING_SLOTS, type BriefingSlot } from "@/lib/market-briefing";
import { todayISO } from "@/lib/dates";

export const maxDuration = 60;

// Fires three times a day (see vercel.json) — each cron entry hits this
// with a different ?slot=. The "close" slot runs after /api/cron/sync-market
// so the day's KIS-sourced ranking data is already in the DB by the time it reads it.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const slot = req.nextUrl.searchParams.get("slot");
  if (!slot || !BRIEFING_SLOTS.includes(slot as BriefingSlot)) {
    return NextResponse.json({ error: "slot 파라미터가 필요해요 (morning/midday/close)" }, { status: 400 });
  }

  try {
    await generateBriefing(slot as BriefingSlot, todayISO());
    return NextResponse.json({ ok: true, slot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "브리핑 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
