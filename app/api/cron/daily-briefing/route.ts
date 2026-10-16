import { NextRequest, NextResponse } from "next/server";
import { generateBriefing, pushBriefingToTelegram, BRIEFING_SLOTS, type BriefingSlot } from "@/lib/market-briefing";
import { todayISO, weekdayLabel } from "@/lib/dates";
import { sendWeeklyPortfolioDigest } from "@/lib/portfolio-alerts";

export const maxDuration = 60;

// Fires three times a day (see vercel.json) — each cron entry hits this
// with a different ?slot=. The "close" slot runs after /api/cron/sync-market
// so the day's KIS-sourced ranking data is already in the DB by the time it reads it.
//
// "주식 학습 플래닛" 미션은 더 이상 여기서 자동 발송하지 않는다— 2026-10-16
// 사용자 피드백: "자동으로 안보내고 내가 말하면 보내줘". 이제 텔레그램에서
// "학습자료 줘"라고 요청할 때만 그 자리에서 내준다(lib/learning-push.ts의
// pullTodayMaterial, lib/telegram-chat.ts에서 호출).
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

    // 주간 자산 진단(module ⑨) — 새 크론을 못 만들어(Hobby 12개 한도) 매주
    // 금요일 장마감 브리핑에 얹는다.
    if (slot === "close" && weekdayLabel(date) === "금") {
      await sendWeeklyPortfolioDigest().catch((e) => console.error("[daily-briefing] weekly digest failed", e));
    }

    return NextResponse.json({ ok: true, slot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "브리핑 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
