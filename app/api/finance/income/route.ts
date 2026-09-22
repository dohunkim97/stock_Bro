import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIncomeRecords, addIncomeRecord } from "@/lib/finance-engine";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  return NextResponse.json(await getIncomeRecords(session.user.id));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const date = typeof body?.date === "string" ? body.date : "";
  const category = typeof body?.category === "string" ? body.category : "";
  const amount = Number(body?.amount);
  if (!date || !category || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "날짜·카테고리·금액이 필요해요" }, { status: 400 });
  }

  const record = await addIncomeRecord(session.user.id, {
    date,
    category,
    amount,
    recurring: !!body?.recurring,
    memo: typeof body?.memo === "string" ? body.memo : undefined,
  });
  return NextResponse.json(record);
}
