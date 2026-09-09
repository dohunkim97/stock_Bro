// DART(전자공시시스템) Open API 연동 — "사업 요약"을 뉴스+LLM 추측이 아니라
// 실제 정기보고서(사업/반기/분기보고서)의 "II. 사업의 내용"에서 가져와
// 사실 기반으로 만든다. 사용자가 발급받은 DART_API_KEY(.env.local, Vercel
// 환경변수)로 호출한다.
//
// 흐름: 종목코드 → corp_code(DART 고유번호, corpCode.xml 전체 목록에서 조회)
// → 최근 2년 내 최신 정기보고서(list.json) → 그 보고서 원문(document.xml,
// zip)에서 "1. 사업의 개요"/"2. 주요 제품 및 서비스"/"5. 정관에 관한 사항
// (신규 사업목적)" 구간만 텍스트로 추출. 이 원문 텍스트가 이후 LLM
// 요약(lib/field-detail.ts)과 종목상세 페이지(components/stock/detail-sections.tsx)
// 양쪽의 "팩트 근거"가 된다 — 표에 없는 수치는 만들어내지 않는다.
//
// corp_code 매핑은 3.6MB 압축 파일이라 웜 람다 인스턴스 메모리에 24시간
// 캐싱해서 재사용한다(콜드 스타트마다 한 번씩만 재요청). DB에 영구 저장하지
// 않는 건 이 프로젝트의 기존 지연로딩 패턴(클릭했을 때만 계산)과 범위를
// 맞추기 위함 — components/bro/field-detail-modal.tsx 등과 동일한 철학.

import AdmZip from "adm-zip";

const DART_BASE = "https://opendart.fss.or.kr/api";

function apiKey(): string | null {
  return process.env.DART_API_KEY || null;
}

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", "");
}

// ---------- 1) corp_code 매핑 (종목코드 → DART 고유번호) ----------

type CorpEntry = { corpCode: string; corpName: string; stockCode: string };

let corpMapCache: { byStockCode: Map<string, CorpEntry>; fetchedAt: number } | null = null;
const CORP_MAP_TTL_MS = 24 * 60 * 60 * 1000;

async function loadCorpMap(): Promise<Map<string, CorpEntry>> {
  if (corpMapCache && Date.now() - corpMapCache.fetchedAt < CORP_MAP_TTL_MS) {
    return corpMapCache.byStockCode;
  }
  const key = apiKey();
  if (!key) return corpMapCache?.byStockCode ?? new Map();

  try {
    const res = await fetch(`${DART_BASE}/corpCode.xml?crtfc_key=${key}`);
    if (!res.ok) return corpMapCache?.byStockCode ?? new Map();
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    const entry = zip.getEntries()[0];
    if (!entry) return corpMapCache?.byStockCode ?? new Map();
    const xml = zip.readAsText(entry);

    const byStockCode = new Map<string, CorpEntry>();
    // 개별 XML 파싱 라이브러리 없이도 <list>...</list> 반복 구조가 단순해서
    // 블록 단위로 잘라 정규식으로 세 필드만 뽑는다(3.6MB 전체를 DOM으로
    // 파싱하는 것보다 훨씬 가볍다).
    const blocks = xml.split("<list>").slice(1);
    for (const b of blocks) {
      const stockCode = b.match(/<stock_code>([^<]*)<\/stock_code>/)?.[1]?.trim() ?? "";
      if (!stockCode) continue; // 상장사만(비상장은 stock_code가 공백)
      const corpCode = b.match(/<corp_code>([^<]*)<\/corp_code>/)?.[1] ?? "";
      const corpName = b.match(/<corp_name>([^<]*)<\/corp_name>/)?.[1] ?? "";
      if (corpCode) byStockCode.set(stockCode, { corpCode, corpName, stockCode });
    }
    corpMapCache = { byStockCode, fetchedAt: Date.now() };
    return byStockCode;
  } catch {
    return corpMapCache?.byStockCode ?? new Map();
  }
}

export async function getCorpCode(stockCode: string): Promise<string | null> {
  const map = await loadCorpMap();
  return map.get(stockCode)?.corpCode ?? null;
}

// ---------- 2) 최신 정기보고서(사업/반기/분기보고서) 찾기 ----------

export type PeriodicReport = { rceptNo: string; reportName: string; reportDate: string };

export async function fetchLatestPeriodicReport(corpCode: string): Promise<PeriodicReport | null> {
  const key = apiKey();
  if (!key) return null;
  const end = todayKst();
  const bgn = String(Number(end.slice(0, 4)) - 2) + end.slice(4); // 최근 2년 — 최소 1개는 걸리도록 넉넉히

  try {
    const params = new URLSearchParams({
      crtfc_key: key,
      corp_code: corpCode,
      bgn_de: bgn,
      end_de: end,
      pblntty: "A",
      page_count: "100",
    });
    const res = await fetch(`${DART_BASE}/list.json?${params.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== "000" || !Array.isArray(json.list)) return null;

    const periodic = (json.list as Array<{ report_nm: string; rcept_no: string; rcept_dt: string }>).filter((r) =>
      /^(사업보고서|반기보고서|분기보고서)/.test(r.report_nm)
    );
    if (periodic.length === 0) return null;
    periodic.sort((a, b) => (a.rcept_dt < b.rcept_dt ? 1 : -1));
    const top = periodic[0];
    return { rceptNo: top.rcept_no, reportName: top.report_nm.trim(), reportDate: top.rcept_dt };
  } catch {
    return null;
  }
}

export function dartDocumentUrl(rceptNo: string): string {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
}

// ---------- 3) 문서 원문에서 "II. 사업의 내용" 관련 구간만 추출 ----------

export type DartTable = string[][]; // 원문 표를 행×셀 배열 그대로 (UI 표 렌더링용)

export type DartBusinessRaw = {
  overviewText: string; // "1. 사업의 개요" 원문(태그 제거, 서술 부분만)
  productsTables: DartTable[]; // "2. 주요 제품 및 서비스" 안에서 숫자가 있는 표들(매출 비중 등)
  newBusinessText: string; // "5. 정관에 관한 사항"의 신규 사업목적 추가 항목(있을 때만)
};

function stripTags(html: string): string {
  return html
    .replace(/<TABLE[\s\S]*?<\/TABLE>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// DART 정기보고서는 법정 서식이라 "1. 사업의 개요" 같은 절 제목 문구 자체는
// 회사마다 동일하다(내부 ATOCID 번호는 회사마다 앞 절 개수가 달라 흔들려서
// 못 믿는다 — 실측 확인: 후성/팬오션 둘 다 제목 문구는 같지만 ATOCID는 다름).
function sectionBetween(xml: string, startTitle: string, endTitle: string | null): string {
  const startRe = new RegExp(`<TITLE[^>]*>${startTitle}</TITLE>`);
  const sm = xml.match(startRe);
  if (!sm || sm.index === undefined) return "";
  const rest = xml.slice(sm.index + sm[0].length);
  if (!endTitle) return rest;
  const endRe = new RegExp(`<TITLE[^>]*>${endTitle}</TITLE>`);
  const em = rest.match(endRe);
  return em && em.index !== undefined ? rest.slice(0, em.index) : rest;
}

// 회사마다 "주요 제품 등의 현황" 표 모양이 제각각이라(열 개수/합쳐진 셀 등)
// 공통 스키마로 억지로 맞추지 않는다 — 숫자가 실제로 들어있는 표만 행×셀
// 배열 그대로 골라내서, 화면에는 표 그대로 보여주고 LLM 요약 프롬프트에는
// 이 배열을 " | "로 이어붙인 텍스트로 넘긴다.
function extractNumericTables(sectionXml: string): DartTable[] {
  const tables = sectionXml.match(/<TABLE[\s\S]*?<\/TABLE>/g) ?? [];
  const result: DartTable[] = [];
  for (const t of tables) {
    const rows = [...t.matchAll(/<TR[\s\S]*?<\/TR>/g)]
      .map((r) =>
        [...r[0].matchAll(/<T[DH][^>]*>([\s\S]*?)<\/T[DH]>/g)].map((c) =>
          c[1]
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/\s+/g, " ")
            .trim()
        )
      )
      .filter((row) => row.some((c) => c.length > 0));
    if (rows.length < 2) continue; // 단위표기(예: "(단위: 백만원)")만 있는 1행짜리는 제외
    const hasNumber = rows.some((r) => r.some((c) => /[\d,]{3,}|\(\s*-?[\d.]+\s*%?\s*\)|%\s*$/.test(c)));
    if (!hasNumber) continue;
    result.push(rows);
  }
  return result;
}

export function dartTablesToText(tables: DartTable[], maxChars = 3500): string {
  const joined = tables.map((rows) => rows.map((r) => r.join(" | ")).join("\n")).join("\n---\n");
  return joined.length > maxChars ? joined.slice(0, maxChars) + " …(생략)" : joined;
}

async function fetchDocumentXml(rceptNo: string): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(`${DART_BASE}/document.xml?crtfc_key=${key}&rcept_no=${rceptNo}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    const entry = zip.getEntries()[0];
    return entry ? zip.readAsText(entry) : null;
  } catch {
    return null;
  }
}

export async function fetchDartBusinessRaw(rceptNo: string): Promise<DartBusinessRaw | null> {
  const xml = await fetchDocumentXml(rceptNo);
  if (!xml) return null;

  const overviewRaw = sectionBetween(xml, "1\\. 사업의 개요", "2\\. 주요 제품 및 서비스");
  const overviewText = stripTags(overviewRaw).slice(0, 3500);

  const productsRaw = sectionBetween(xml, "2\\. 주요 제품 및 서비스", "3\\. 원재료 및 생산설비");
  const productsTables = extractNumericTables(productsRaw);

  // "5. 정관에 관한 사항" 안에서 사업목적을 새로 추가한 항목은
  // [사업명] 뒤에 "(1) 그 사업 분야... 및 진출 목적" 식으로 구조화돼 있다
  // (법정 서식). 최근 사업목적 추가가 없는 회사는 이 구간이 아예 비어있는
  // 게 정상이라 그때는 빈 문자열을 그대로 둔다(지어내지 않음).
  const articlesRaw = sectionBetween(xml, "5\\. 정관에 관한 사항", "II\\. 사업의 내용");
  const blocks = [...articlesRaw.matchAll(/<SPAN USERMARK="B">\[([^\]]+)\]<\/SPAN>([\s\S]*?)(?=<SPAN USERMARK="B">\[|$)/g)];
  const newBusinessText = blocks
    .map((b) => `[${b[1]}] ${stripTags(b[2]).slice(0, 800)}`)
    .join("\n\n")
    .slice(0, 2500);

  return { overviewText, productsTables, newBusinessText };
}

// ---------- 4) 종목코드 하나로 전체 흐름을 묶어서 실행 ----------

export type DartBusinessBundle = {
  reportName: string;
  reportDate: string;
  dartUrl: string;
  raw: DartBusinessRaw;
};

export async function fetchDartBusinessBundle(stockCode: string): Promise<DartBusinessBundle | null> {
  if (!apiKey()) return null;
  const corpCode = await getCorpCode(stockCode);
  if (!corpCode) return null;
  const report = await fetchLatestPeriodicReport(corpCode);
  if (!report) return null;
  const raw = await fetchDartBusinessRaw(report.rceptNo);
  if (!raw) return null;
  return { reportName: report.reportName, reportDate: report.reportDate, dartUrl: dartDocumentUrl(report.rceptNo), raw };
}
