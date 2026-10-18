// 골구 워크스페이스(app/api/bro/route.ts)가 채팅 메시지 안에서 실제
// 종목명을 찾아내고, 그 종목의 "6대 매수 기준"(시황/거래량/차트/재료/수급/
// 재무 + 매수타이밍)을 즉석에서 계산하는 곳 — lib/candidate-detail.ts는
// 원래 골구가 미리 뽑아둔 "오늘의 후보"에만 쓰였는데, 여기서는 사용자가
// 채팅으로 아무 종목이나 물어봐도 같은 계산을 그 자리에서 돌린다(그 종목이
// 공식 추천 후보일 필요 없음).

import { prisma } from "@/lib/prisma";
import { getCandidateDetails, type CandidateDetail } from "@/lib/candidate-detail";
import { todayISO } from "@/lib/dates";

const MAX_MENTIONS = 5;

// StockMaster 전체 종목명을 훑어서 메시지 텍스트 안에 실제로 등장하는
// 이름을 전부 찾는다 — "한켐, 비츠로테크, 센서뷰 비교해줘"처럼 구분자가
// 콤마든 공백이든 상관없이, 그 이름이 문자 그대로 포함돼 있는지만 본다.
// 1글자 이름은 오탐이 너무 많아 제외하고, "삼성"이 "삼성전자" 매칭에 얹혀
// 중복으로 안 잡히도록 더 긴 이름에 포함되는 짧은 매칭은 버린다.
// 대소문자는 구분하지 않는다 — "LG에너지솔루션"을 "lg에너지솔루션"으로 쳐도
// 찾아야 한다(2026-10-19 사용자 확인: 소문자로 치니까 분석이 아예 안 됐음 —
// 알파벳이 섞인 종목명이 많아서 .includes()가 대소문자를 그대로 구분하던 게
// 원인이었다).
export async function findMentionedStocks(text: string): Promise<{ name: string; code: string }[]> {
  const all = await prisma.stockMaster.findMany({ select: { name: true, code: true } });
  const lowerText = text.toLowerCase();
  const found = all.filter((s) => s.name.length >= 2 && lowerText.includes(s.name.toLowerCase()));
  const deduped = found.filter(
    (f) => !found.some((other) => other !== f && other.name.length > f.name.length && other.name.toLowerCase().includes(f.name.toLowerCase()))
  );
  return deduped.slice(0, MAX_MENTIONS);
}

// 채팅에서 언급된 종목 하나의 6대 매수 기준을 즉석 계산 — reasoning은
// 근거 문장이 아니라 "왜 이 데이터를 계산했는지"라 화면에 그대로 노출되는
// aiReasoning(4. 재료) 값이 "사용자 채팅 요청으로 조회"로만 나온다.
// 실제 재료 판단은 marketContext/aiReasoning 각각의 LLM 호출이 대신 채운다.
export async function buildStockReport(name: string, code: string): Promise<CandidateDetail | null> {
  const details = await getCandidateDetails([{ name, code, reasoning: "" }], todayISO());
  return details[0] ?? null;
}

// 채팅 LLM이 실제 숫자를 지어내지 않고 방금 조회한 데이터를 근거로 답하도록
// 시스템 프롬프트에 덧붙이는 블록.
export function stockContextBlock(reports: CandidateDetail[]): string {
  if (reports.length === 0) return "";
  const lines = ["[지금 대화에서 새로 조회한 종목 데이터 — 전부 실데이터, 반드시 이 근거로 답해]"];
  for (const d of reports) {
    lines.push(
      `- ${d.name}(${d.code ?? "코드미상"}): 현재가(=매수기준가)=${d.strategy.entryPrice ?? "-"} / 시황=${d.marketContext} / 거래량=${d.volumeNote} / 차트=${d.chartNote} / 재료=${d.aiReasoning} / 수급=${d.supplyDemand} / 재무=${d.financialSummary} / 지지선=${d.strategy.support ?? "-"} 저항선=${d.strategy.resistance ?? "-"} 목표가=${d.strategy.targetPrice ?? "-"} 손절가=${d.strategy.stopLossPrice ?? "-"}`
    );
  }
  return lines.join("\n");
}
