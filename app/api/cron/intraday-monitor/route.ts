import { NextRequest, NextResponse } from "next/server";
import { runIntradayCycle } from "@/lib/intraday-signal";

export const maxDuration = 30;

// 장중(09:00~15:00 KST, vercel.json 스케줄 참고) 매 정시마다 호출되는
// 유일한 장중 시그널 크론 — 원래 scan(1분 간격)/monitor(5분 간격) 크론
// 2개로 나뉘어 있었는데, 배포가 통째로 실패하는 사고로 이어졌다(2026-
// 09-16 밤~2026-09-21). 실제 원인은 이 계정(Hobby 요금제)의 Cron Jobs
// 설정 화면에서 확인됨 — Hobby는 크론 하나가 "시간당 1번"을 넘게 도는
// 스케줄 자체를 등록해주지 않는다(1분/5분/10분 간격 전부 해당, 개수나
// 문법 문제가 아니었음). 그래서 크론 1개(시간당 정확히 1번, 하루 7회)가
// lib/intraday-signal.ts의 runIntradayCycle을 불러서, 그 안에서 "지금이
// 스캔 구간인지/장이 끝났는지"를 시간으로 갈라 스캔·모니터링·장마감
// 강제청산을 알아서 나눠 처리한다.
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
