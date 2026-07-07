import { NextRequest, NextResponse } from "next/server";
import { addEntry } from "@/lib/market-data";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, listType, name, price, changePct, volume } = body ?? {};

  if (!date || (listType !== "volume" && listType !== "gainer")) {
    return NextResponse.json({ error: "잘못된 요청이에요" }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "종목명을 입력해 주세요" }, { status: 400 });
  }
  if (typeof price !== "string" || !price.trim()) {
    return NextResponse.json({ error: "현재가를 입력해 주세요" }, { status: 400 });
  }
  const pct = Number(changePct);
  if (Number.isNaN(pct)) {
    return NextResponse.json({ error: "등락률을 숫자로 입력해 주세요" }, { status: 400 });
  }

  try {
    const entry = await addEntry({
      date,
      listType,
      name,
      price,
      changePct: pct,
      volume: typeof volume === "string" ? volume : undefined,
    });
    return NextResponse.json({ entry });
  } catch (e) {
    const message = e instanceof Error ? e.message : "추가하지 못했어요";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
