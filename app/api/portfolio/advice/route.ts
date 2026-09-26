import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPortfolioSettings, getHoldingsWithLiveData, computeOverview } from "@/lib/portfolio";
import { generatePortfolioAdvice } from "@/lib/portfolio-advisor";
import { getAssessmentReport } from "@/lib/holding-assessment-store";

export const maxDuration = 60; // 종목 진단 계산(lib/holding-assessment-store.ts)을 먼저 기다린다

// 요청형(request-time) LLM 호출 — 사용자가 둥지 페이지를 열 때 클라이언트
// (components/nest/advisor-card.tsx)가 그때그때 호출한다. 결과를 저장하지
// 않는 이유는 lib/portfolio-advisor.ts 상단 주석 참고.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const [settings, holdings] = await Promise.all([
    getPortfolioSettings(session.user.id),
    getHoldingsWithLiveData(session.user.id),
  ]);
  const overview = computeOverview(settings, holdings);

  if (holdings.length === 0 && settings.totalSeed === 0) {
    return NextResponse.json({ error: "아직 등록된 자산이 없어요. 먼저 종목이나 시드를 등록해줘." }, { status: 400 });
  }

  try {
    // 진단 카드가 같은 계산을 동시에 부르지만 getAssessmentReport가 겹치는 요청을 합쳐준다.
    // 진단이 실패해도 자산 배분 설명은 할 수 있게 null로 넘긴다.
    const report = await getAssessmentReport(session.user.id).catch(() => null);
    const advice = await generatePortfolioAdvice(overview, report);
    if (!advice) return NextResponse.json({ error: "지금은 분석을 가져오지 못했어요. 잠깐 뒤 다시 시도해줘." }, { status: 502 });
    return NextResponse.json(advice);
  } catch {
    return NextResponse.json({ error: "지금은 분석을 가져오지 못했어요. 잠깐 뒤 다시 시도해줘." }, { status: 502 });
  }
}
