import { NextRequest, NextResponse } from "next/server";
import { addToWatchlist, getWatchlist } from "@/lib/watchlist";

export async function GET() {
  const watchlist = await getWatchlist();
  return NextResponse.json(watchlist);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!code || !name) {
    return NextResponse.json({ error: "code, name이 필요해요" }, { status: 400 });
  }
  try {
    const entry = await addToWatchlist({
      code,
      name,
      market: typeof body?.market === "string" ? body.market : null,
      sector: typeof body?.sector === "string" ? body.sector : null,
    });
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "관심종목에 추가하지 못했어요" }, { status: 400 });
  }
}
