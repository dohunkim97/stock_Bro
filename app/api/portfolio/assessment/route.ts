import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAssessmentReport } from "@/lib/holding-assessment-store";

// 종목마다 시세·일봉·수급·재무를 가져오는 계산이라 서버 렌더에 끼우지 않고
// 클라이언트(components/nest/assessment-panel.tsx)가 마운트된 뒤 부른다.
// 상한은 Vercel Hobby의 함수 실행시간 최대치(60초).
export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  try {
    return NextResponse.json(await getAssessmentReport(session.user.id));
  } catch {
    return NextResponse.json({ error: "지금은 진단을 가져오지 못했어요. 잠깐 뒤 다시 시도해줘." }, { status: 502 });
  }
}
