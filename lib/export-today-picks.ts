// 사용자 로컬의 기업분석 파이프라인(다트 데이터\기업분석 데이터 폴더를 보는
// finance_py.py 및 그 형제 "사업분석 생성" 스크립트)이 어떤 종목부터
// 우선 분석할지 알 수 있게, 매일 골구가 예측한 종목 코드들을 우선순위
// 순서로 today_picks.json에 내보낸다.
//
// 우선순위 규칙: WeeklyPrediction을 최신순으로 훑으면서 후보 코드를
// 순서대로 모은다 — 오늘 예측이 항상 맨 위(가장 최근 생성)라 자연히
// 최우선이 되고, 그다음은 예측일이 최근일수록 앞에 온다(사용자 요청:
// "우선적으로 최신 종목들 올려주고 전에 예상했던 종목들 넣어줘"). 이미
// CompanyAnalysis가 있는(분석 끝난) 종목은 빼서 — 하루 처리 한도를 아직
// 분석 안 된 종목에만 쓰게 한다("중복되는 종목은 걸러서").

import { readFile, writeFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { parsePredictionCandidates } from "@/lib/prediction-scoring";

export const TODAY_PICKS_PATH =
  "C:\\Users\\PC\\Desktop\\바이브 코딩\\다트 데이터\\기업분석 데이터\\today_picks.json";

// "하루에 20개씩"(사용자 지정) — finance_py.py 자체 한도(MAX_DAILY_BATCH=25)
// 보다 살짝 낮춰서 여유를 둔다.
const MAX_PICKS = 20;

export async function buildTodayPicksList(): Promise<string[]> {
  const predictions = await prisma.weeklyPrediction.findMany({
    orderBy: { createdAt: "desc" },
    select: { candidates: true },
  });

  const seen = new Set<string>();
  const codes: string[] = [];
  for (const p of predictions) {
    for (const c of parsePredictionCandidates(p.candidates)) {
      if (!c.code || seen.has(c.code)) continue;
      seen.add(c.code);
      codes.push(c.code);
    }
  }

  const analyzed = await prisma.companyAnalysis.findMany({ select: { code: true } });
  const analyzedSet = new Set(analyzed.map((a) => a.code));
  const unanalyzed = codes.filter((c) => !analyzedSet.has(c));

  return unanalyzed.slice(0, MAX_PICKS);
}

export type ExportResult = { codes: string[]; path: string; changed: boolean };

export async function exportTodayPicks(): Promise<ExportResult> {
  const codes = await buildTodayPicksList();
  const json = JSON.stringify(codes);

  // 내용이 그대로면 굳이 다시 안 쓴다 — 파일 mtime이 안 바뀌어야 파이썬
  // 스크립트를 하루에 여러 번 돌려도 매번 "새 파일"로 오해하지 않는다.
  let previous: string | null = null;
  try {
    previous = await readFile(TODAY_PICKS_PATH, "utf-8");
  } catch {
    // 파일이 아직 없으면 정상 — 처음 쓰는 경우
  }
  if (previous === json) return { codes, path: TODAY_PICKS_PATH, changed: false };

  await writeFile(TODAY_PICKS_PATH, json, "utf-8");
  return { codes, path: TODAY_PICKS_PATH, changed: true };
}
