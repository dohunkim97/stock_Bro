import { getKisAccessToken } from "@/lib/kis-token";

const FINANCIAL_RATIO_URL = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/finance/financial-ratio";
const PER_REQUEST_TIMEOUT_MS = 8000;

// 국내주식 재무비율(국내주식-080, tr_id FHKST66430300). 필드명(lblt_rate=부채비율,
// rsrv_rate=유보율)은 한국투자증권 공식 GitHub 예제(COLUMN_MAPPING)의 한글 라벨로
// 확인했다. 실제로 1회 호출해(2026-10-27, 삼성전자 005930) rsrv_rate=57213.76 같은
// 응답을 받았고, 공개 재무제표 근사치와 자릿수(수만%대)가 일치한다는 정황도 확인했다
// — 다만 정확한 계산식·단위가 공식 문서로 검증된 것은 아니다. 유보율은 이 저장소에
// 검증된 대체 출처가 없어, "공식 검증 완료"가 아니라 "운영상 KIS 값을 데이터
// 출처로 채택한다"는 결정으로 사용 중이다(lib/bottom-fish-scan.ts의
// RESERVE_RATIO_SOURCE_ACCEPTED 참고).
export type FinancialRatioResult = { debtRatio: number | null; reserveRatio: number | null };

// null/undefined/빈 문자열을 Number()에 그대로 넘기면 각각 0으로 변환돼(Number(null)===0,
// Number("")===0) "값이 없음"이 "유보율 0%"로 오판될 수 있다 — 반드시 먼저 걸러낸다.
export function parseRatioNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// stac_yymm이 정확히 6자리 숫자(YYYYMM)이고 월(뒤 2자리)이 01~12 범위인지 확인한다.
// 문자열 비교로 최신을 고르기 전에 반드시 이 검증을 거쳐야, "abc"나 "99"처럼 자리수가
// 다른 값이 유니코드 비교상 우연히 더 크게 나와 잘못 선택되는 걸 막을 수 있다.
export function isValidYymm(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  if (!/^\d{6}$/.test(raw)) return false;
  const month = Number(raw.slice(4, 6));
  return month >= 1 && month <= 12;
}

// KIS가 output을 여러 기간(실측: 23행)으로 한 번에 돌려준다 — 배열 순서가 최신순이라고
// 보장할 근거가 없어, stac_yymm(YYYYMM 문자열, 자릿수 고정이라 문자열 비교=숫자 비교)이
// 가장 큰(=가장 최근) 행을 명시적으로 고른다. 유효하지 않은 날짜(결측·형식오류)를 가진
// 행은 비교 대상에서 아예 제외한다 — 날짜 없는 행이 하나뿐이어도 임의로 선택하지 않고,
// 유효한 행이 하나도 없으면 null을 반환한다. 동일한 기준 기간이 여러 번 나오면(엄격한
// "더 큼" 비교라) 배열에서 먼저 나온 행이 유지된다(기존 동작, 이번에 바꾸지 않음).
export function pickLatestRow(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestYymm = "";
  for (const r of rows) {
    const yymm = r.stac_yymm;
    if (!isValidYymm(yymm)) continue; // 형식이 안 맞으면 비교 대상에서 제외(선택하지 않음)
    if (yymm > bestYymm) {
      best = r;
      bestYymm = yymm;
    }
  }
  return best;
}

type RawCallResult = { ok: boolean; authError: boolean; data: FinancialRatioResult | null };

async function callFinancialRatio(code: string): Promise<RawCallResult> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return { ok: false, authError: true, data: null };

  const token = await getKisAccessToken();
  if (!token) return { ok: false, authError: true, data: null };

  const url = new URL(FINANCIAL_RATIO_URL);
  url.searchParams.set("fid_cond_mrkt_div_code", "J");
  url.searchParams.set("fid_input_iscd", code);
  url.searchParams.set("fid_div_cls_code", "0"); // 0: 연간 — 미검증, 실제 응답으로 재확인 필요

  try {
    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST66430300",
        custtype: "P",
      },
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, authError: true, data: null };
    if (!res.ok) return { ok: false, authError: false, data: null };

    const json = await res.json();
    if (json?.rt_cd !== "0") {
      // KIS는 권한 오류도 HTTP 200 + rt_cd!=="0"으로 돌려주는 경우가 있다(이 저장소의
      // 다른 KIS 호출부 관찰과 일치) — msg1에 권한/인증 관련 문구가 있는지로 추정
      // 구분한다. 이 구분 자체도 미검증이라, 실제 오류 메시지를 보고 재확인해야 한다.
      const authish = /권한|인증|unauthorized|forbidden/i.test(String(json?.msg1 ?? ""));
      return { ok: false, authError: authish, data: null };
    }

    const rows: Record<string, unknown>[] = Array.isArray(json.output) ? json.output : [];
    const latest = pickLatestRow(rows);
    if (!latest) return { ok: true, authError: false, data: { debtRatio: null, reserveRatio: null } };

    return {
      ok: true,
      authError: false,
      data: {
        debtRatio: parseRatioNumber(latest.lblt_rate),
        reserveRatio: parseRatioNumber(latest.rsrv_rate),
      },
    };
  } catch {
    return { ok: false, authError: false, data: null }; // 타임아웃 등 — 일시적 오류(재시도 대상)로 취급
  }
}

// 유동성이 큰 종목 1개로 본 스캔 전 1회만 호출 — 권한/인증 오류를 조기에 감지해서
// 250종목 전체에 같은 실패를 반복하지 않는다(여러 라운드 전 합의된 설계).
const PROBE_CODE = "005930"; // 삼성전자

export async function probeFinancialRatioAccess(): Promise<{ accessible: boolean; reason?: string }> {
  const r = await callFinancialRatio(PROBE_CODE);
  if (r.authError) return { accessible: false, reason: "FINANCIAL_RATIO_AUTH_ERROR" };
  if (!r.ok) return { accessible: false, reason: "FINANCIAL_RATIO_PROBE_FAILED" };
  return { accessible: true };
}

export type FinancialFetchStatus = "ok" | "auth_error" | "transient_error";

export async function fetchFinancialRatio(code: string): Promise<{ status: FinancialFetchStatus; data: FinancialRatioResult | null }> {
  const r = await callFinancialRatio(code);
  if (r.authError) return { status: "auth_error", data: null };
  if (!r.ok) return { status: "transient_error", data: null };
  return { status: "ok", data: r.data };
}
