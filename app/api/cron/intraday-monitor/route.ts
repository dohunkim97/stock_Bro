import { NextRequest, NextResponse } from "next/server";
import { runIntradayCycle } from "@/lib/intraday-signal";

export const maxDuration = 30;

// 장중(09:00~15:00 KST) 매 정시마다 호출되는 장중 시그널 크론 — 원래
// scan(1분 간격)/monitor(5분 간격) 크론 2개로 나뉘어 있었는데, 배포가
// 통째로 실패하는 사고로 이어졌다(2026-09-16 밤~2026-09-21). 실측으로
// 확정된 원인: 이 계정(Hobby 요금제)은 schedule 필드에 시/분 범위나
// 간격("0-6", "*/10" 등)을 쓰면 크론 개수와 무관하게 등록 자체를 거부
// 한다 — 요일 필드의 "1-5" 범위만 예외적으로 허용됨(이미 다른 크론들도
// 다 그렇게 쓰고 있어서 안전). 그래서 vercel.json엔 이 경로 하나를
// "?slot=1"~"?slot=7"로(같은 경로를 그대로 여러 번 등록하면 Vercel이
// 조용히 하나로 합쳐버리는 문제 — 앞서 sync-market에서 이미 겪음 —
// 쿼리스트링만 다르게 붙여 구분) 매 정시 고정값으로 7번 따로 등록해뒀다.
// 이 라우트 자체는 "몇 시에 불렸는지"를 몰라도 되고(runIntradayCycle이
// 매번 현재 시각을 직접 읽어서 스캔/모니터링/장마감 강제청산을 알아서
// 갈라 처리) — 그래서 slot 값 자체는 여기서 아예 안 쓴다.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await runIntradayCycle();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "장중 시그널 처리 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
