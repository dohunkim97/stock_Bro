import { NextRequest, NextResponse } from "next/server";
import { generateBriefing, pushBriefingToTelegram, BRIEFING_SLOTS, type BriefingSlot } from "@/lib/market-briefing";
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
    const date = todayISO();
    await generateBriefing(slot as BriefingSlot, date);
    // 텔레그램 연결된 사용자에게 먼저 보내기 — 실패해도 브리핑 생성 자체는
    // 이미 끝났으니 크론을 실패 처리하지 않는다.
    await pushBriefingToTelegram(date, slot as BriefingSlot).catch((e) => console.error("[daily-briefing] push failed", e));
    return NextResponse.json({ ok: true, slot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "브리핑 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
