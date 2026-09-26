import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getExpenseRecords, addExpenseRecord, addInstallmentExpense } from "@/lib/finance-engine";
import { MIN_INSTALLMENT_MONTHS, MAX_INSTALLMENT_MONTHS } from "@/lib/installment";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  return NextResponse.json(await getExpenseRecords(session.user.id));
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

  // 할부: amount는 총 결제금액, 회차별 금액은 서버가 계산한다(lib/installment.ts)
  const months = Number(body?.installmentMonths);
  if (body?.installmentMonths !== undefined && body?.installmentMonths !== null && months !== 0) {
    if (!Number.isInteger(months) || months < MIN_INSTALLMENT_MONTHS || months > MAX_INSTALLMENT_MONTHS) {
      return NextResponse.json({ error: `할부는 ${MIN_INSTALLMENT_MONTHS}~${MAX_INSTALLMENT_MONTHS}개월까지 가능해요` }, { status: 400 });
    }
    const rate = Number(body?.annualRatePct ?? 0);
    const result = await addInstallmentExpense(session.user.id, {
      startDate: date,
      category,
      totalAmount: amount,
      months,
      annualRatePct: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 0,
      memo: typeof body?.memo === "string" ? body.memo : undefined,
    });
    if (!result) return NextResponse.json({ error: "할부를 계산하지 못했어요" }, { status: 400 });
    return NextResponse.json({ ok: true, groupId: result.groupId, plan: result.plan });
  }

  const record = await addExpenseRecord(session.user.id, {
    date,
    category,
    amount,
    recurring: !!body?.recurring,
    memo: typeof body?.memo === "string" ? body.memo : undefined,
  });
  return NextResponse.json(record);
}
