import { getKisAccessToken } from "@/lib/kis-token";

const NEWS_TITLE_URL = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/news-title";
const PER_REQUEST_TIMEOUT_MS = 8000;

// Corporate-action/regulatory notices and auto-generated exchange
// statistics — technically tagged to the stock (some even legitimately as
// iscd1, e.g. "today's top mover in this ranking"), but not an explanation
// of why it moved. Two families: (1) corporate filings (전환사채, 소유주식수
// 변동 등), (2) auto-generated ranking/roundup/technical-indicator wire
// copy (~상위종목, 증시요약, VI 발동, 가격제한폭 등) — verified these leak
// through the iscd1-primary-subject filter when the stock happens to be
// that ranking's top entry.
const NOISE_TITLE_PATTERN =
  /조회공시|매매거래정지|불성실공시|투자주의|투자유의|투자경고|투자위험|관리종목|대차거래|공매도|대량보유|지분보고|전환사채|전환가액|만기전사채|신주인수권|주식소각|자기주식|최대주주\s*변경|주식병합|주식분할|액면분할|단기과열|소유주식수\s*변동|추가상장|상위\s*\d*\s*종목|갱신\s*상위|하락률\s*상위|상승률\s*상위|거래량\s*상위|거래대금\s*상위|거래량\s*(증가|급증|감소)|순매수\s*상위|순매도\s*상위|증시요약|기술적\s*분석|특징주\s*[A-Z★\*]|VI\s*발동|변동성완화장치|가격제한폭|프로그램\s*매매|외국계\s*순매[수도]|외국인\s*순매[수도]|오후장|오전장|정오\s*시황|마감\s*시황|장중\s*시황|시장\s*흐름|매수우위|매도우위|코스[피닥]\s*은|테마동향/;

// A title listing several stocks with "+N.NN%"/"-N.NN%" next to each (e.g.
// "삼아알미늄 +9.35%, 대양금속 +5.41%, 포스코엠텍 +5.02%...") is a ticker-tape
// snippet, not an article about the one stock we filtered it in for.
function isTickerTapeList(title: string): boolean {
  const matches = title.match(/[+-]\d+(\.\d+)?%/g);
  return !!matches && matches.length >= 2;
}

export type KisNewsItem = {
  title: string;
  date: string; // YYYYMMDD
  time: string; // HHMMSS
  source?: string;
  stockName?: string;
};

// "우리기술투자 급등세 기록중" 같은, 이 종목이 움직이고 있다는 사실 자체만
// 되풀이하는 자동생성성 캡션 — 왜 움직이는지에 대한 정보가 전혀 없다.
// NOISE_TITLE_PATTERN(공시/집계성 기사)과 달리 이건 걸러내지 않고 "다른 후보가
// 없을 때만 쓰는 최후의 수단"으로 격을 낮추는 용도라 exported해서 pickBestIssue
// 쪽에서 순위를 매기는 데 쓴다. 다만 "…신고가 경신, 전일 외국인 대량 순매수"처럼
// 쉼표 뒤에 진짜 이유가 붙어있으면 이 패턴에 걸려도 정보가 있는 걸로 쳐야 해서,
// hasReasonClause와 같이 써야 한다 — 이 패턴 하나만으로 판단하지 말 것.
const PRICE_ACTION_ONLY_PATTERN =
  /(급등세|급락세|강세|약세|상한가|하한가|신고가|신저가|상승세|하락세|거래량\s*몰림)\s*(를\s*)?(기록|경신|지속|이어가|전환|보이)/;

// 쉼표 뒤에 어느 정도 길이 있는 절이 더 있으면("…경신, 전일 외국인 대량
// 순매수") 앞쪽에 가격움직임 단어가 섞여 있어도 이유가 담긴 기사로 본다 —
// PRICE_ACTION_ONLY_PATTERN만으로 판단하면 이런 제목까지 오탐으로 걸러낸다.
function hasReasonClause(title: string): boolean {
  const parts = title
    .split(/[,、]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 && parts[parts.length - 1].length >= 6;
}

// 종목당 최대 3건까지 받아오는 후보 중, 가격 움직임만 되풀이하는 캡션 말고
// "왜 움직였는지"가 담긴 기사(공시/이슈/테마 언급 등)를 우선한다 — 첫 번째로
// 찾은 것을 그냥 쓰던 예전 방식은 정작 이유를 담은 기사가 2·3번째에 있어도
// 놓쳤다.
export function pickBestIssue(candidates: KisNewsItem[]): KisNewsItem | undefined {
  const informative = candidates.find((n) => hasReasonClause(n.title) || !PRICE_ACTION_ONLY_PATTERN.test(n.title));
  return informative ?? candidates[0];
}

// 종합 시황/공시(제목) — 국내주식-141, tr_id FHKST01011800.
//
// Called with FID_INPUT_ISCD blank ("전체"), this turns out to be a generic
// newswire firehose (정치/국제/사회 뉴스 — verified empirically), not curated
// market commentary, and nothing comes back tagged to a stock code. Scoped
// to a specific code, it returns genuinely relevant market-moving news for
// that stock instead (verified against 005930 — real 코스피 급락/사이드카
// coverage came back). So this only takes a code, not "all stocks" — callers
// should loop it over today's actual top movers, not call it blank.
async function fetchKisNewsTitleForCode(code: string, limit: number): Promise<KisNewsItem[]> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return [];

  const token = await getKisAccessToken();
  if (!token) return [];

  const url = new URL(NEWS_TITLE_URL);
  url.searchParams.set("FID_NEWS_OFER_ENTP_CODE", "");
  url.searchParams.set("FID_COND_MRKT_CLS_CODE", "");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_TITL_CNTT", "");
  url.searchParams.set("FID_INPUT_DATE_1", "");
  url.searchParams.set("FID_INPUT_HOUR_1", "");
  url.searchParams.set("FID_RANK_SORT_CLS_CODE", "");
  url.searchParams.set("FID_INPUT_SRNO", "");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST01011800",
        custtype: "P",
      },
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.rt_cd !== "0") return [];

    const output = json.output;
    const rows: Record<string, unknown>[] = Array.isArray(output) ? output : output ? [output] : [];

    return rows
      // KIS returns items where the queried code appears anywhere in
      // iscd1-5, not just ones actually about it — a lot of what comes
      // back is multi-stock roundup/ranking wire copy ("코스닥 하락률 상위
      // 20종목") whose real subject (iscd1) is some other stock entirely.
      // Requiring iscd1 to match keeps only articles primarily about this
      // code — verified empirically (roundup titles consistently failed
      // this check; genuine per-stock items consistently passed it).
      .filter((o) => String(o.iscd1 ?? "").trim() === code)
      .map((o) => ({
        title: String(o.hts_pbnt_titl_cntt ?? "").trim(),
        date: String(o.data_dt ?? ""),
        time: String(o.data_tm ?? ""),
        source: String(o.dorg ?? "").trim() || undefined,
        stockName: String(o.kor_isnm1 ?? "").trim() || undefined,
      }))
      .filter((n) => n.title && !NOISE_TITLE_PATTERN.test(n.title) && !isTickerTapeList(n.title))
      .slice(0, limit);
  } catch {
    return [];
  }
}

const PER_STOCK_LIMIT = 3;
const CODE_CONCURRENCY = 4;

// Fetches news for each of the given (deduped) stock codes, a few at a
// time to stay under KIS's rate limit (same pattern as
// lib/kis-ranking.ts's enrichWithKisQuote), and flattens the results.
export async function fetchKisNewsForCodes(codes: string[]): Promise<KisNewsItem[]> {
  const unique = [...new Set(codes)].filter(Boolean);
  const results: KisNewsItem[] = [];

  for (let i = 0; i < unique.length; i += CODE_CONCURRENCY) {
    const batch = unique.slice(i, i + CODE_CONCURRENCY);
    const batchResults = await Promise.all(batch.map((code) => fetchKisNewsTitleForCode(code, PER_STOCK_LIMIT)));
    for (const r of batchResults) results.push(...r);
  }

  return results;
}
