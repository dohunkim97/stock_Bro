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

// list.json/document.xml 콜 자체는 실측 1초 안쪽(icn1 프로덕션에서 각각
// 900ms/600ms대)이라 15초 같은 고정 타임아웃을 걸면 오히려 위험하다 —
// 콜드 스타트(람다 인스턴스가 이 라우트를 처음 맡을 때, 핸들러가 실행되기
// 전 초기화에 드는 시간)가 실측 15초 이상 걸릴 수 있어서, 핸들러 안에서
// 시작하는 각 fetch가 그 여유 시간을 다 못 받으면 실제로는 멀쩡히 응답
// 올 콜이 중간에 잘려 "찾지 못했어요"로 잘못 보이게 된다(실측). 그래서
// 개별 고정 타임아웃 대신, /api/bro/field-detail의 maxDuration(30초) 안에서
// LLM 요약 몫을 남겨두고 남은 시간을 그때그때 나눠 쓰는 공유 데드라인을
// 쓴다.
function remainingMs(deadlineAt: number, floor = 3000): number {
  return Math.max(floor, deadlineAt - Date.now());
}

// ---------- 1) corp_code 매핑 (종목코드 → DART 고유번호) ----------
//
// corpCode.xml은 비상장사까지 다 합쳐 3.6MB 압축/30MB 해제 크기라, 요청마다
// (혹은 콜드 스타트마다) 받아서 파싱하면 서버리스 함수 제한 시간(30초)을
// 넘길 수 있다(실측: 프로덕션에서 FUNCTION_INVOCATION_TIMEOUT 발생, 로컬
// 개발 서버에서는 몇 초로 멀쩡했던 것과 대조적 — 네트워크/CPU 여유가 다른
// 서버리스 환경 특성). 그래서 상장사만(비상장은 stock_code가 공백이라
// 애초에 필요 없음) 걸러낸 매핑을 lib/data/dart-corp-codes.json으로 미리
// 만들어 저장소에 커밋해두고, 요청 때는 이 정적 파일만 읽는다(즉시 응답).
// 최근 상장해서 이 스냅샷에 아직 없는 종목만 라이브 API로 한 번 보정한다.
import corpCodeSnapshot from "@/lib/data/dart-corp-codes.json";

type CorpEntry = { corpCode: string; corpName: string };
const STATIC_CORP_MAP: Record<string, CorpEntry> = corpCodeSnapshot as Record<string, CorpEntry>;

let liveCorpMapCache: { byStockCode: Map<string, CorpEntry>; fetchedAt: number } | null = null;
const LIVE_CORP_MAP_TTL_MS = 24 * 60 * 60 * 1000;

async function loadLiveCorpMap(deadlineAt: number): Promise<Map<string, CorpEntry>> {
  if (liveCorpMapCache && Date.now() - liveCorpMapCache.fetchedAt < LIVE_CORP_MAP_TTL_MS) {
    return liveCorpMapCache.byStockCode;
  }
  const key = apiKey();
  if (!key) return liveCorpMapCache?.byStockCode ?? new Map();

  try {
    const res = await fetch(`${DART_BASE}/corpCode.xml?crtfc_key=${key}`, {
      signal: AbortSignal.timeout(remainingMs(deadlineAt, 5000)),
    });
    if (!res.ok) return liveCorpMapCache?.byStockCode ?? new Map();
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    const entry = zip.getEntries()[0];
    if (!entry) return liveCorpMapCache?.byStockCode ?? new Map();
    const xml = zip.readAsText(entry);

    const byStockCode = new Map<string, CorpEntry>();
    const blocks = xml.split("<list>").slice(1);
    for (const b of blocks) {
      const stockCode = b.match(/<stock_code>([^<]*)<\/stock_code>/)?.[1]?.trim() ?? "";
      if (!stockCode) continue;
      const corpCode = b.match(/<corp_code>([^<]*)<\/corp_code>/)?.[1] ?? "";
      const corpName = b.match(/<corp_name>([^<]*)<\/corp_name>/)?.[1] ?? "";
      if (corpCode) byStockCode.set(stockCode, { corpCode, corpName });
    }
    liveCorpMapCache = { byStockCode, fetchedAt: Date.now() };
    return byStockCode;
  } catch {
    return liveCorpMapCache?.byStockCode ?? new Map();
  }
}

export async function getCorpCode(stockCode: string, deadlineAt: number = Date.now() + 20000): Promise<string | null> {
  const fromSnapshot = STATIC_CORP_MAP[stockCode];
  if (fromSnapshot) return fromSnapshot.corpCode;
  // 스냅샷 이후 새로 상장된 종목일 때만 라이브 조회로 보정 — 흔치 않은
  // 경로라 여기서만 느린 전체 목록 다운로드 비용을 감수한다.
  const live = await loadLiveCorpMap(deadlineAt);
  return live.get(stockCode)?.corpCode ?? null;
}

// ---------- 2) 최신 정기보고서(사업/반기/분기보고서) 찾기 ----------

export type PeriodicReport = { rceptNo: string; reportName: string; reportDate: string };

export async function fetchLatestPeriodicReport(corpCode: string, deadlineAt: number): Promise<PeriodicReport | null> {
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
    const res = await fetch(`${DART_BASE}/list.json?${params.toString()}`, {
      signal: AbortSignal.timeout(remainingMs(deadlineAt)),
    });
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

async function fetchDocumentXml(rceptNo: string, deadlineAt: number): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(`${DART_BASE}/document.xml?crtfc_key=${key}&rcept_no=${rceptNo}`, {
      signal: AbortSignal.timeout(remainingMs(deadlineAt)),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    const entry = zip.getEntries()[0];
    return entry ? zip.readAsText(entry) : null;
  } catch {
    return null;
  }
}

export async function fetchDartBusinessRaw(rceptNo: string, deadlineAt: number): Promise<DartBusinessRaw | null> {
  const xml = await fetchDocumentXml(rceptNo, deadlineAt);
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

// /api/bro/field-detail의 maxDuration을 45초로 늘려뒀고(route.ts) 그 뒤에
// LLM 요약 호출이 하나 더 있어서(lib/field-detail.ts, 자체 10초 타임아웃)
// 이 함수 혼자 예산을 다 쓰면 안 된다. 55초짜리 여유 타임아웃으로 직접
// 재보니 document.xml은 Vercel(icn1)→DART 경로에서 매번 정확히 18초
// 안팎 걸려서야 응답이 옴(같은 요청을 로컬/다른 네트워크에서 부르면
// 0.3초 안쪽 — 편차가 아니라 그 경로 자체의 고정 지연으로 보임). 압축
// 해제·정규식 파싱은 실측 10ms 안쪽이라 병목이 아니다. 그 실측치보다
// 확실히 위인 22초를 준다.
const BUNDLE_BUDGET_MS = 22000;

// document.xml 왕복이 이 경로에서 고정적으로 ~18~20초라(위 주석), 매 클릭마다
// 새로 받으면 사용자가 매번 그 시간을 기다려야 한다 — 같은 분기/반기 보고서는
// 다음 정기공시 전까지 안 바뀌니, 웜 람다 인스턴스가 살아있는 동안은 재사용
// 해도 안전하다(어차피 최신 정기보고서 자체를 다시 확인하려면 콜드 스타트로
// 캐시가 비워질 때 자연스럽게 새로 받아온다).
const bundleCache = new Map<string, { bundle: DartBusinessBundle; fetchedAt: number }>();
const BUNDLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function fetchDartBusinessBundle(stockCode: string): Promise<DartBusinessBundle | null> {
  const cached = bundleCache.get(stockCode);
  if (cached && Date.now() - cached.fetchedAt < BUNDLE_CACHE_TTL_MS) return cached.bundle;

  if (!apiKey()) return null;
  const deadlineAt = Date.now() + BUNDLE_BUDGET_MS;
  const corpCode = await getCorpCode(stockCode, deadlineAt);
  if (!corpCode) return null;
  const report = await fetchLatestPeriodicReport(corpCode, deadlineAt);
  if (!report) return null;
  const raw = await fetchDartBusinessRaw(report.rceptNo, deadlineAt);
  if (!raw) return null;
  const bundle = { reportName: report.reportName, reportDate: report.reportDate, dartUrl: dartDocumentUrl(report.rceptNo), raw };
  bundleCache.set(stockCode, { bundle, fetchedAt: Date.now() });
  return bundle;
}
