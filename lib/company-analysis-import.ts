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

// 생성 프로그램이 도중에 스키마를 바꿨다(실측: 71개 파일 중 21개가 새
// 형식) — 예전엔 category_1_company_overview/category_2_business_operation/
// master_analyst_final_verdict였는데, 새 파일들은 그 둘을 business_analysis
// 하나(안에 governance_and_history/business_fundamentals 두 항목 +
// business_verdict 배열)로 합친 훨씬 단순한 모양으로 온다. 렌더링
// (company-analysis-render.tsx)이 두 스키마를 다 알게 만드느니, 저장하기
// 전에 여기서 예전 모양(category_N_.../sub_N_.../master_analyst_final_verdict)
// 으로 맞춰서 렌더링 쪽은 손댈 필요가 없게 한다 — business_analysis의 두
// 항목을 각각 자기만의 category로 펼쳐서(항목당 sub_1 하나) 예전처럼 2칸
// 그리드가 채워지게 하고, 각 항목이 이미 갖고 있는 title(예: "1. 사명 변경
// 및 경영진 교체 위험도")을 그대로 살린다.
function normalizeAnalysisJson(json: Record<string, unknown>): Record<string, unknown> {
  const ba = json.business_analysis;
  if (!ba || typeof ba !== "object" || Array.isArray(ba)) return json;

  const rest = { ...json };
  delete rest.business_analysis;
  const { business_verdict, ...subItems } = ba as Record<string, unknown>;

  const normalized: Record<string, unknown> = { ...rest };
  let i = 1;
  for (const [key, value] of Object.entries(subItems)) {
    normalized[`category_${i}_${key}`] = { [`sub_1_${key}`]: value };
    i++;
  }
  if (business_verdict !== undefined) normalized.master_analyst_final_verdict = business_verdict;
  return normalized;
}

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
    json = normalizeAnalysisJson(JSON.parse(text));
  } catch (e) {
    return { ok: false, file: fileName, reason: e instanceof Error ? e.message : "읽기/파싱 실패" };
  }

  const name = typeof json.company_name === "string" ? json.company_name : "";
  const reportName = typeof json.report_name === "string" ? json.report_name : "";
  const reportUrl = typeof json.report_url === "string" ? json.report_url : "";
  // 정확한 키 이름(category_1_company_overview 등)으로 검증하면 스키마가
  // 또 바뀌었을 때 다시 전부 거부당한다 — "category_로 시작하는 키가 최소
  // 2개는 있다"는 정도만 확인(구형식 2개, 신형식도 normalizeAnalysisJson이
  // 2개로 펼쳐줌).
  const categoryKeyCount = Object.keys(json).filter((k) => k.startsWith("category_")).length;
  if (!name || categoryKeyCount < 1) {
    return { ok: false, file: fileName, reason: "필수 필드 누락(company_name/사업분석 내용)" };
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
