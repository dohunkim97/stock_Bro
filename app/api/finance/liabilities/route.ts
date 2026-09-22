import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLiabilities, addLiability } from "@/lib/finance-engine";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  return NextResponse.json(await getLiabilities(session.user.id));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const type = typeof body?.type === "string" ? body.type : "기타";
  const principal = Number(body?.principal);
  const interestRate = Number(body?.interestRate);
  if (!name || !Number.isFinite(principal) || principal <= 0 || !Number.isFinite(interestRate)) {
    return NextResponse.json({ error: "이름·원금·금리가 필요해요" }, { status: 400 });
  }

  const liability = await addLiability(session.user.id, {
    name,
    type,
    principal,
    interestRate,
    monthlyPayment: Number.isFinite(Number(body?.monthlyPayment)) ? Number(body.monthlyPayment) : 0,
    maturityDate: typeof body?.maturityDate === "string" && body.maturityDate ? body.maturityDate : null,
  });
  return NextResponse.json(liability);
}
