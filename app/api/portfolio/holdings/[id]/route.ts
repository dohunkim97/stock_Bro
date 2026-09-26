import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { removeHolding, updateHoldingBuyDate } from "@/lib/portfolio";

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

// 매수일 수정 — 예전에 등록해 매수일이 비어 있는 종목을 채우거나 고칠 때 쓴다.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const raw = body?.buyDate;
  const buyDate = raw === null || raw === "" ? null : typeof raw === "string" && /^d{4}-d{2}-d{2}$/.test(raw) ? raw : undefined;
  if (buyDate === undefined) return NextResponse.json({ error: "날짜 형식이 올바르지 않아요" }, { status: 400 });

  const result = await updateHoldingBuyDate(session.user.id, id, buyDate).catch(() => null);
  if (!result || result.count === 0) return NextResponse.json({ error: "수정하지 못했어요" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
