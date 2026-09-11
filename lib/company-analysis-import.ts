// 사용자가 로컬에서 돌리는 "기업분석" 프로그램이 만든 JSON 파일 하나를
// 읽어서 prisma.companyAnalysis에 올린다 — scripts/watch-company-analysis.ts
// (폴더 감시)와, 필요하면 수동 1회성 스크립트 양쪽에서 재사용한다.
//
// 파일 스키마는 회사마다 sub_* 키 구성이 조금씩 다르지만(실측: 삼성전자엔
// "sub_6_rnd_and_contracts"가 있고 디에스케이엔 없음, "sub_3_..." 이름
// 자체도 회사마다 다름), 최상위 4개 필드(company_name, stock_code,
// report_name, report_url)와 category_1/2 + master_analyst_final_verdict
// 구조는 공통이라 이 정도만 검증하고 나머지(rawJson)는 그대로 통째로
// 보관한다 — UI(components/stock/company-analysis-section.tsx)가 파싱 시점
// 이 아니라 렌더링 시점에 유연하게 읽는다.

import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { fetchKisCodeMaster, findInCodeMaster } from "@/lib/kis-code-master";

export type ImportResult =
  | { ok: true; code: string; name: string }
  | { ok: false; file: string; reason: string };

// company_name만 있고 stock_code가 없는 파일(실측: 삼성전자_00126380,
// SK하이닉스_00164779 — 파일명에 DART corp_code만 들어간 케이스)은 이미
// 있는 KIS 종목마스터 이름 매칭으로 보완한다(lib/kis-code-master.ts —
// LLM이 고른 회사명을 종목코드로 바꿀 때도 쓰는 같은 로직).
async function resolveStockCode(json: Record<string, unknown>): Promise<string | null> {
  const direct = typeof json.stock_code === "string" ? json.stock_code.trim() : "";
  if (direct) return direct;
  const name = typeof json.company_name === "string" ? json.company_name : "";
  if (!name) return null;
  const master = await fetchKisCodeMaster();
  return findInCodeMaster(master, name)?.code ?? null;
}

export async function importCompanyAnalysisFile(filePath: string): Promise<ImportResult> {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  let json: Record<string, unknown>;
  try {
    const text = await readFile(filePath, "utf-8");
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, file: fileName, reason: e instanceof Error ? e.message : "읽기/파싱 실패" };
  }

  const name = typeof json.company_name === "string" ? json.company_name : "";
  const reportName = typeof json.report_name === "string" ? json.report_name : "";
  const reportUrl = typeof json.report_url === "string" ? json.report_url : "";
  if (!name || !json.category_1_company_overview || !json.category_2_business_operation) {
    return { ok: false, file: fileName, reason: "필수 필드 누락(company_name/category_1/category_2)" };
  }

  const code = await resolveStockCode(json);
  if (!code) {
    return { ok: false, file: fileName, reason: `종목코드를 찾지 못함(회사명: ${name})` };
  }

  await prisma.companyAnalysis.upsert({
    where: { code },
    create: { code, name, reportName, reportUrl, rawJson: JSON.stringify(json), sourceFile: fileName },
    update: { name, reportName, reportUrl, rawJson: JSON.stringify(json), sourceFile: fileName },
  });

  return { ok: true, code, name };
}
