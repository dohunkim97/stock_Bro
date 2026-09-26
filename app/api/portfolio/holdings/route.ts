import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addHolding, getHoldings, resolveHoldingCode } from "@/lib/portfolio";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  const holdings = await getHoldings(session.user.id);
  return NextResponse.json(holdings);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const buyPrice = Number(body?.buyPrice);
  const quantity = Number(body?.quantity);
  if (!name || !Number.isFinite(buyPrice) || buyPrice <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "종목명·매수가·수량이 필요해요" }, { status: 400 });
  }

  // 클라이언트가 이미 자동완성으로 code를 알고 있으면 그대로 쓰고, 없으면
  // (직접 타이핑 등) 서버에서 한 번 더 resolveHoldingCode로 확인한다.
  const code =
    typeof body?.code === "string" && body.code.trim()
      ? body.code.trim()
      : (await resolveHoldingCode(name))?.code;
  if (!code) {
    return NextResponse.json({ error: `"${name}" 종목을 찾지 못했어요` }, { status: 400 });
  }

  const buyDate = typeof body?.buyDate === "string" && /^d{4}-d{2}-d{2}$/.test(body.buyDate) ? body.buyDate : null;

  try {
    const holding = await addHolding(session.user.id, { name, code, buyPrice, quantity, buyDate });
    return NextResponse.json(holding);
  } catch {
    return NextResponse.json({ error: "보유 종목을 추가하지 못했어요" }, { status: 400 });
  }
}
