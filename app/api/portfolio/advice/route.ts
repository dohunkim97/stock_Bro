import { NextResponse } from "next/server";
import { getPortfolioSettings, getHoldingsWithLiveData, computeOverview } from "@/lib/portfolio";
import { generatePortfolioAdvice } from "@/lib/portfolio-advisor";

export const maxDuration = 30;

// 요청형(request-time) LLM 호출 — 사용자가 둥지 페이지를 열 때 클라이언트
// (components/nest/advisor-card.tsx)가 그때그때 호출한다. 결과를 저장하지
// 않는 이유는 lib/portfolio-advisor.ts 상단 주석 참고.
export async function POST() {
  const [settings, holdings] = await Promise.all([getPortfolioSettings(), getHoldingsWithLiveData()]);
  const overview = computeOverview(settings, holdings);

  if (holdings.length === 0 && settings.totalSeed === 0) {
    return NextResponse.json({ error: "아직 등록된 자산이 없어요. 먼저 종목이나 시드를 등록해줘." }, { status: 400 });
  }

  try {
    const advice = await generatePortfolioAdvice(overview, holdings);
    if (!advice) return NextResponse.json({ error: "지금은 분석을 가져오지 못했어요. 잠깐 뒤 다시 시도해줘." }, { status: 502 });
    return NextResponse.json(advice);
  } catch {
    return NextResponse.json({ error: "지금은 분석을 가져오지 못했어요. 잠깐 뒤 다시 시도해줘." }, { status: 502 });
  }
}
