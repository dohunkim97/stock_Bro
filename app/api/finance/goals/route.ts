import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFinancialGoals, addFinancialGoal } from "@/lib/finance-engine";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  return NextResponse.json(await getFinancialGoals(session.user.id));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const targetAmount = Number(body?.targetAmount);
  const targetDate = typeof body?.targetDate === "string" ? body.targetDate : "";
  const monthlyContribution = Number(body?.monthlyContribution);
  if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0 || !targetDate || !Number.isFinite(monthlyContribution)) {
    return NextResponse.json({ error: "목표명·목표금액·목표일·월 투자금이 필요해요" }, { status: 400 });
  }

  const goal = await addFinancialGoal(session.user.id, {
    name,
    targetAmount,
    targetDate,
    monthlyContribution,
    expectedReturnPct: Number.isFinite(Number(body?.expectedReturnPct)) ? Number(body.expectedReturnPct) : 5,
  });
  return NextResponse.json(goal);
}
