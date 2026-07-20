import { NextRequest, NextResponse } from "next/server";
import { fetchNews } from "@/lib/naver-news";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json({ error: "query가 필요해요" }, { status: 400 });
  }
  const items = await fetchNews(query, 6);
  return NextResponse.json({ items });
}
