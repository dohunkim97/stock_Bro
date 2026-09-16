// KIS(한국투자증권) 국내주식 분봉조회 — lib/kis-chart.ts(일/주/월봉)의
// 당일 분(minute) 버전. 이 엔드포인트는 "당일" 데이터만 주고, 한 번
// 호출에 최근 ~30건 정도의 분봉만 돌려준다(페이징 없음 — 장중 몇 분치만
// 보면 되는 용도라 lib/kis-chart.ts처럼 과거로 계속 페이지를 넘길 필요가
// 없다).
//
// ⚠️ 이 파일은 실제 KIS 응답 필드명을 라이브 장중에 직접 검증하지 못한
// 상태로 작성됐다(공식 문서 기준 필드명 사용) — 배포 후 첫 장중 실행
// 결과를 반드시 확인할 것. 필드가 다르면 candles가 조용히 빈 배열로
// 돌아올 뿐 에러는 안 난다(lib/kis-chart.ts와 동일한 fail-safe 설계).
import { getKisAccessToken } from "@/lib/kis-token";

const MINUTE_CHART_URL =
  "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice";
const PER_REQUEST_TIMEOUT_MS = 6000;

export type MinuteCandle = {
  time: string; // HHMMSS, 그 분봉의 체결 시각
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // 그 분(캔들)의 거래량(주)
  tradingValue: number; // 누적거래대금(원, 당일 장 시작부터 그 시점까지 누적) — 캔들 자체 거래대금은 직전 캔들과의 차이로 계산해야 함
};

// baseHourHHMMSS 생략 시 "지금 이 순간까지"의 최근 분봉들을 가져온다.
export async function fetchKisMinuteChart(code: string, baseHourHHMMSS?: string): Promise<MinuteCandle[]> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return [];

  const token = await getKisAccessToken();
  if (!token) return [];

  const now = new Date();
  const nowHHMMSS =
    String(now.getUTCHours() + 9).padStart(2, "0").slice(-2) +
    String(now.getUTCMinutes()).padStart(2, "0") +
    String(now.getUTCSeconds()).padStart(2, "0");

  const url = new URL(MINUTE_CHART_URL);
  url.searchParams.set("FID_ETC_CLS_CODE", "");
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_INPUT_HOUR_1", baseHourHHMMSS ?? nowHHMMSS);
  // 과거(그날 장 시작부터) 데이터까지 포함 — 아니면 기준시각 직전 한두
  // 건만 돌아와서 "직전 평균 대비 급증"을 계산할 데이터가 안 모인다.
  url.searchParams.set("FID_PW_DATA_INCU_YN", "Y");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST03010200",
        custtype: "P",
      },
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.rt_cd !== "0") return [];

    const rows: Record<string, unknown>[] = Array.isArray(json.output2) ? json.output2 : [];

    // KIS는 최신순으로 돌려준다(일봉 조회와 동일 관례) — 시간순(과거→현재)으로 뒤집는다.
    return rows
      .map((r) => ({
        time: String(r.stck_cntg_hour ?? ""),
        open: Number(r.stck_oprc) || 0,
        high: Number(r.stck_hgpr) || 0,
        low: Number(r.stck_lwpr) || 0,
        close: Number(r.stck_prpr) || 0,
        volume: Number(r.cntg_vol) || 0,
        tradingValue: Number(r.acml_tr_pbmn) || 0,
      }))
      .filter((c) => c.time.length === 6 && c.close > 0)
      .reverse();
  } catch {
    return [];
  }
}
