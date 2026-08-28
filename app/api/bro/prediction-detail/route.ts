import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePredictionCandidates } from "@/lib/prediction-scoring";
import { getCandidateDetails } from "@/lib/candidate-detail";
import { fetchKisChart } from "@/lib/kis-chart";
import { computeTechnicalSignals, LONG_TERM_SIGNAL_CANDLES } from "@/lib/technical-signals";

export const maxDuration = 60;

// 기록보관소의 예상리포트 탭은 최대 14일치 과거 리포트를 한 번에 나열하는데,
// 종목 하나당 LLM 호출(사업요약·시황) + 시세/수급/재무 API 여러 번이 붙는
// getCandidateDetails를 14일 x 종목 5개만큼 전부 미리 불러오면 페이지 로딩이
// 너무 느려지고 비용도 커진다. 그래서 이 무거운 상세 정보는 사용자가 실제로
// 그 날짜 카드를 열어볼 때만 이 라우트로 그때그때 불러온다
// (components/bro/archive-prediction-detail.tsx가 클라이언트에서 호출).
export async function GET(req: NextRequest) {
  const forDate = req.nextUrl.searchParams.get("forDate");
  if (!forDate || !/^\d{4}-\d{2}-\d{2}$/.test(forDate)) {
    return NextResponse.json({ error: "invalid forDate" }, { status: 400 });
  }

  const row = await prisma.weeklyPrediction.findUnique({ where: { forDate } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const candidates = parsePredictionCandidates(row.candidates);
  const [details, candlesList] = await Promise.all([
    getCandidateDetails(candidates),
    Promise.all(candidates.map((c) => (c.code ? fetchKisChart(c.code, "D", LONG_TERM_SIGNAL_CANDLES) : Promise.resolve([])))),
  ]);

  const merged = details.map((d, i) => ({ ...d, signals: computeTechnicalSignals(candlesList[i]) }));
  return NextResponse.json({ candidates: merged });
}
