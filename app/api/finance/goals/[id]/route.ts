import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateFinancialGoal, removeFinancialGoal, type FinancialGoalInput } from "@/lib/finance-engine";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const input: Partial<FinancialGoalInput> = {};
  if (typeof body?.name === "string" && body.name.trim()) input.name = body.name.trim();
  if (typeof body?.targetDate === "string" && body.targetDate) input.targetDate = body.targetDate;
  const targetAmount = Number(body?.targetAmount);
  if (Number.isFinite(targetAmount)) input.targetAmount = targetAmount;
  const monthlyContribution = Number(body?.monthlyContribution);
  if (Number.isFinite(monthlyContribution)) input.monthlyContribution = monthlyContribution;
  const expectedReturnPct = Number(body?.expectedReturnPct);
  if (Number.isFinite(expectedReturnPct)) input.expectedReturnPct = expectedReturnPct;

  const ok = await updateFinancialGoal(session.user.id, id, input);
  if (!ok) return NextResponse.json({ error: "수정하지 못했어요" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  const { id } = await params;
  await removeFinancialGoal(session.user.id, id);
  return NextResponse.json({ ok: true });
}
