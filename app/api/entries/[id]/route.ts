import { NextRequest, NextResponse } from "next/server";
import { deleteEntry } from "@/lib/market-data";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await deleteEntry(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "삭제하지 못했어요" }, { status: 400 });
  }
}
