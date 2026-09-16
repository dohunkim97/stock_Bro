import { NextRequest, NextResponse } from "next/server";
import { monitorIntradaySignals, closeOutIntradaySignals } from "@/lib/intraday-signal";
import { currentMarketStatus } from "@/lib/dates";

export const maxDuration = 30;

// 장중(09:00~15:30 KST, vercel.json 스케줄 참고) 5분마다 호출돼서 이미
// 포착된 시그널이 목표수익에 도달했는지/5선을 이탈했는지 확인한다. 장
// 마감 이후 첫 호출에서는(currentMarketStatus가 false) 그때까지 열려
// 있던 시그널을 전부 현재가로 강제 청산한다 — lib/intraday-signal.ts 참고.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    if (currentMarketStatus().isOpen) {
      await monitorIntradaySignals();
    } else {
      await closeOutIntradaySignals();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "장중 시그널 모니터링 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
