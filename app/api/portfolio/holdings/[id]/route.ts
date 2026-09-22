import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { removeHolding } from "@/lib/portfolio";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const { id } = await params;
  try {
    await removeHolding(session.user.id, id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "삭제하지 못했어요" }, { status: 400 });
  }
}
