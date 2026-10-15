import { NextRequest, NextResponse } from "next/server";
import { generateBriefing, pushBriefingToTelegram, BRIEFING_SLOTS, type BriefingSlot } from "@/lib/market-briefing";
import { todayISO, weekdayLabel } from "@/lib/dates";
import { sendWeeklyPortfolioDigest } from "@/lib/portfolio-alerts";
import { sendDailyMissions, sendSundayReviews } from "@/lib/learning-push";

export const maxDuration = 60;

// Fires three times a day on weekdays, plus once on Sunday morning (see
// vercel.json) — each cron entry hits this with a different ?slot=. The
// "close" slot runs after /api/cron/sync-market so the day's KIS-sourced
// ranking data is already in the DB by the time it reads it.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const slot = req.nextUrl.searchParams.get("slot");
  if (!slot || !BRIEFING_SLOTS.includes(slot as BriefingSlot)) {
    return NextResponse.json({ error: "slot 파라미터가 필요해요 (morning/midday/close)" }, { status: 400 });
  }

  const date = todayISO();

  // 일요일엔 장이 안 열려서 시황 데이터가 없다 — morning 슬롯 크론을
  // 일요일에도 돌게 해뒀으니(새 크론을 못 만드는 건 아래 주간 자산 진단과
  // 같은 이유, Hobby 12개 한도), 여기서 시황 브리핑 대신 "주식 학습
  // 플래닛"의 일요일 복습만 보내고 끝낸다.
  if (slot === "morning" && weekdayLabel(date) === "일") {
    const summary = await sendSundayReviews().catch((e) => {
      console.error("[daily-briefing] sunday review failed", e);
      return null;
    });
    return NextResponse.json({ ok: true, slot, sundayReview: summary });
  }

  try {
    await generateBriefing(slot as BriefingSlot, date);
    // 텔레그램 연결된 사용자에게 먼저 보내기 — 실패해도 브리핑 생성 자체는
    // 이미 끝났으니 크론을 실패 처리하지 않는다.
    await pushBriefingToTelegram(date, slot as BriefingSlot).catch((e) => console.error("[daily-briefing] push failed", e));

    // 주간 자산 진단(module ⑨) — 새 크론을 못 만들어(Hobby 12개 한도) 매주
    // 금요일 장마감 브리핑에 얹는다.
    if (slot === "close" && weekdayLabel(date) === "금") {
      await sendWeeklyPortfolioDigest().catch((e) => console.error("[daily-briefing] weekly digest failed", e));
    }

    // 주식 학습 플래닛 평일 미션 — 모닝 브리핑에 얹는다(같은 이유로 새
    // 크론 없이).
    if (slot === "morning") {
      await sendDailyMissions().catch((e) => console.error("[daily-briefing] learning push failed", e));
    }

    return NextResponse.json({ ok: true, slot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "브리핑 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
