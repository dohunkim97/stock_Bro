import { NextRequest, NextResponse } from "next/server";
import { runMarketSync } from "@/lib/sync-runner";
import { generateBriefing, BRIEFING_SLOTS, type BriefingSlot } from "@/lib/market-briefing";
import { todayISO } from "@/lib/dates";

// runMarketSync 쪽 여유(app/api/cron/sync-market/route.ts 주석 참고, 최대
// 280초까지 걸릴 수 있음)에 그 뒤 generateBriefing까지 더해서 돈다.
export const maxDuration = 280;

// 시세 동기화(sync-market)와 그 직후의 AI 브리핑(daily-briefing)이 항상
// 같은 시각(중간 12:00, 장마감 15:30)에 나가야 하는데, 예전엔 이걸 크론
// 2개를 "같은 시각"에 등록해서 처리했다 — 그런데 Vercel 계정의 크론 개수
// 한도(2026-09-21 장중 시그널 배포 사고로 확인, 정확히 7개까지만 허용)
// 때문에 슬롯이 모자라서, 중간/장마감 두 쌍을 각각 크론 하나로 합쳤다.
// 부수 효과로 순서 문제도 고쳐졌다 — 크론 2개가 "같은 시각"에 등록만
// 됐을 뿐 실제 동시 실행 순서는 보장되지 않았는데, 여기선 await로
// 동기화가 끝난 뒤에만 브리핑이 그날 KIS 랭킹 데이터를 읽게 확정된다.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const slot = req.nextUrl.searchParams.get("slot");
  if (!slot || !BRIEFING_SLOTS.includes(slot as BriefingSlot)) {
    return NextResponse.json({ error: "slot 파라미터가 필요해요 (midday/close)" }, { status: 400 });
  }

  try {
    const sync = await runMarketSync();
    await generateBriefing(slot as BriefingSlot, todayISO());
    return NextResponse.json({ ok: true, slot, sync });
  } catch (e) {
    const message = e instanceof Error ? e.message : "동기화/브리핑 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
