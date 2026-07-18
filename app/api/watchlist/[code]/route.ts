import { NextRequest, NextResponse } from "next/server";
import { removeFromWatchlist } from "@/lib/watchlist";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  try {
    await removeFromWatchlist(code);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "삭제하지 못했어요" }, { status: 400 });
  }
}
