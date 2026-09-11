import { NextRequest, NextResponse } from "next/server";
import { getCompanyAnalysisMarketNote } from "@/lib/field-detail";

export const maxDuration = 30;

// AI 기업분석(공시 시점 펀더멘털)과 최신 뉴스·오늘 시황을 LLM으로 한 번 더
// 엮어보는 지연 로딩 라우트 — components/stock/market-note-button.tsx가
// 버튼을 눌렀을 때만 호출한다.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const name = req.nextUrl.searchParams.get("name");
  if (!code || !name) return NextResponse.json({ error: "code, name required" }, { status: 400 });

  try {
    return NextResponse.json(await getCompanyAnalysisMarketNote(code, name));
  } catch (e) {
    const message = e instanceof Error ? e.message : "시황 연계 분석을 불러오지 못했어요";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
