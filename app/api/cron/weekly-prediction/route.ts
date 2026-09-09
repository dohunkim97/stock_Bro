import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyPrediction } from "@/lib/weekly-prediction";
import { generatePeriodAnalysis } from "@/lib/period-analysis";

export const maxDuration = 120;

// Fires daily on weekdays, after close (see vercel.json) — publishes a
// fresh 5-거래일 pick sheet for TODAY (forDate), upserting only to guard
// against a same-day retry. Each day's row is permanent; it doesn't get
// overwritten by the next day's run, so 기록보관소 can keep every past
// day's own cumulative-return tracking independent of later picks.
//
// Also checks (best-effort, after the daily pick is safely saved) whether
// any 주/월 period just had its LAST day's 5-거래일 window finish — if so,
// generates that period's 주간분석/월간분석 once (lib/period-analysis.ts is
// idempotent, so a period that's already analyzed or not yet fully elapsed
// is a cheap no-op every other day this runs).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await generateWeeklyPrediction();
  } catch (e) {
    const message = e instanceof Error ? e.message : "예측 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    await generatePeriodAnalysis("week");
    await generatePeriodAnalysis("month");
  } catch (e) {
    console.error("[cron/weekly-prediction] period analysis failed:", e);
    // best-effort — 오늘의 예상 리포트 자체는 이미 저장됐으니 실패로 치지 않는다
  }

  return NextResponse.json({ ok: true });
}
