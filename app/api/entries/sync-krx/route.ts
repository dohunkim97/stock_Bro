import { NextRequest, NextResponse } from "next/server";
import { runMarketSync } from "@/lib/sync-runner";

export const maxDuration = 60;

// Manual trigger for the "지금 동기화" button — same sync logic as the cron
// route, just callable from the UI without the cron secret.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const date = typeof body?.date === "string" ? body.date : undefined;

  try {
    const result = await runMarketSync(date);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "동기화 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
