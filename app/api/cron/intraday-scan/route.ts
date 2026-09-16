import { NextRequest, NextResponse } from "next/server";
import { scanIntradaySignals } from "@/lib/intraday-signal";

export const maxDuration = 30;

// 장 시작 직후 몇 분간(vercel.json 스케줄 참고, 09:00~09:14 KST) 1분마다
// 호출돼서 "기준 거래대금 돌파 + 양봉" 초단기 시그널을 실시간으로
// 포착한다 — lib/intraday-signal.ts 참고.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await scanIntradaySignals();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "장중 시그널 스캔 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
