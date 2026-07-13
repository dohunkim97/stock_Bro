import { NextRequest, NextResponse } from "next/server";
import { runMarketSync } from "@/lib/sync-runner";

export const maxDuration = 60;

// Triggered by Vercel Cron (see vercel.json). Vercel automatically sends
// `Authorization: Bearer $CRON_SECRET` when that env var is set — this
// rejects anyone else hitting the route directly.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMarketSync();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "동기화 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
