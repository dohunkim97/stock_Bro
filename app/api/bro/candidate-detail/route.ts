import { NextResponse } from "next/server";
import { getLatestPrediction, parsePredictionCandidates } from "@/lib/prediction-scoring";
import { getCandidateDetails } from "@/lib/candidate-detail";

// Fans out several KIS/data.go.kr calls per candidate (quote, investor
// trend, chart, financials) plus one batched LLM call — same headroom as
// the other /bro routes rather than the platform's short default.
export const maxDuration = 30;

export async function GET() {
  const latest = await getLatestPrediction();
  if (!latest) return NextResponse.json({ details: [] });

  const candidates = parsePredictionCandidates(latest.candidates);
  const details = await getCandidateDetails(candidates);
  return NextResponse.json({ details });
}
