// 골구2(바닥매수 기법 독립 실험) 화면 전용 샘플 데이터 — 1단계(화면 작업)
// 승인 범위: 실제 DB/KIS/data.go.kr에 연결하지 않고, 전부 하드코딩된 값만 쓴다.
// 기존 /bro(골구)·기존 Prisma 모델·lib/* 함수는 이 파일에서 전혀 import하지 않는다.
// 실제 데이터 연결은 2단계(재무 로직)·3단계(테스트 DB) 이후 별도 승인 대상이다.

export type FundStatus = "pass" | "unknown";

// 기준 하나의 충족 여부 — 실제 BottomFishSignal의 저장값(rsi14, debtRatio 등)과
// ruleConfig(임계값 스냅샷)를 그대로 비교하는 방식을 그대로 흉내 낸 구조다. 실제
// 연결 시에는 이 Criterion[]을 "저장된 값 vs ruleConfig" 계산 결과로 채우면 된다 —
// 점수(배점) 체계는 기존 로직에 없어 넣지 않았다(충족/미충족/데이터없음 3단계만).
export type CriterionStatus = "pass" | "fail" | "unknown";
export type Criterion = {
  key: string;
  label: string;
  value: string; // 실제 측정값(표시용) — 데이터 없으면 "—"
  threshold: string; // 기준값(표시용) — lib/bottom-fish-scan.ts의 ruleConfig 스냅샷에 해당
  status: CriterionStatus;
  note?: string; // 상태에 대한 추가 설명(예: 유보율 검증 게이트 미해제로 항상 데이터없음)
};

export type SampleSignal = {
  code: string;
  name: string;
  fundStatus: FundStatus;
  rsi14: number;
  dropFromHighPct: number;
  buyPrice: number;
  buyDate: string; // 신호 발생일(forDate에 해당) — YYYY-MM-DD(샘플)
  firstSeenDate: string; // 최초 발견일 — 같은 종목의 과거 신호 중 가장 이른 forDate(샘플)
  criteria: Criterion[];
  finalReason: string; // 종합 결과 요약(최종 선정 이유 또는 탈락 이유)
};

// 바닥매수 전략의 실제 임계값(lib/bottom-fish-scan.ts 상수와 동일한 값) — 범례
// 패널에 그대로 노출한다. 코드가 바뀌면 이 값도 같이 맞춰야 한다(지금은 수기 동기화).
export const CRITERIA_DEFINITIONS = [
  { key: "rsi14", label: "RSI(14)", condition: "30 미만", scoreNote: "배점 없음(통과/미통과만 판정)" },
  { key: "dropFromHighPct", label: "60거래일 고점 대비 하락률", condition: "20% 이상 하락", scoreNote: "배점 없음(통과/미통과만 판정)" },
  { key: "bullish", label: "양봉 조건", condition: "당일 종가 ≥ 전일 종가", scoreNote: "배점 없음(통과/미통과만 판정)" },
  { key: "per", label: "PER", condition: "0 초과 15 이하", scoreNote: "배점 없음, data.go.kr 기준 계산" },
  { key: "debtRatio", label: "부채비율", condition: "150% 이하", scoreNote: "배점 없음, data.go.kr 기준 계산" },
  { key: "reserveRatio", label: "유보율", condition: "700% 이상", scoreNote: "출처·단위 미검증 — 검증 게이트가 꺼져 있는 한 실제로는 항상 '데이터 없음'" },
] as const;

function criteriaFor(opts: {
  rsi14: number;
  dropFromHighPct: number;
  bullish: boolean;
  per: number | null;
  debtRatio: number | null;
  // reserveRatioRaw: 실제 측정값 자체가 없는 경우(조회 실패)와, 측정값은 있지만
  // 출처·단위 검증이 안 돼 판정에 반영하지 않는 경우를 구분해서 보여주기 위한 값.
  // 어느 쪽이든 RESERVE_RATIO_SOURCE_VERIFIED=false인 한 status는 항상 "unknown"
  // (판정에는 반영 안 됨) — 다만 value/note 문구로 두 상황을 구분해 표시한다.
  reserveRatioRaw: number | null;
}): Criterion[] {
  return [
    {
      key: "rsi14",
      label: "RSI(14)",
      value: opts.rsi14.toFixed(1),
      threshold: "30 미만",
      status: opts.rsi14 < 30 ? "pass" : "fail",
    },
    {
      key: "dropFromHighPct",
      label: "60거래일 고점 대비 하락률",
      value: `${Math.abs(opts.dropFromHighPct).toFixed(1)}%`,
      threshold: "20% 이상",
      status: Math.abs(opts.dropFromHighPct) >= 20 ? "pass" : "fail",
    },
    {
      key: "bullish",
      label: "양봉 조건",
      value: opts.bullish ? "양봉" : "음봉",
      threshold: "양봉",
      status: opts.bullish ? "pass" : "fail",
    },
    {
      key: "per",
      label: "PER",
      value: opts.per === null ? "—" : opts.per.toFixed(1),
      threshold: "0 초과 15 이하",
      status: opts.per === null ? "unknown" : opts.per > 0 && opts.per <= 15 ? "pass" : "fail",
    },
    {
      key: "debtRatio",
      label: "부채비율",
      value: opts.debtRatio === null ? "—" : `${opts.debtRatio.toFixed(1)}%`,
      threshold: "150% 이하",
      status: opts.debtRatio === null ? "unknown" : opts.debtRatio <= 150 ? "pass" : "fail",
    },
    {
      key: "reserveRatio",
      label: "유보율",
      value: opts.reserveRatioRaw === null ? "—" : `${opts.reserveRatioRaw.toFixed(1)}%(출처 미검증, 판정 미반영)`,
      threshold: "700% 이상",
      status: "unknown",
      note:
        opts.reserveRatioRaw === null
          ? "유보율 조회 자체에 실패해 측정값이 없습니다."
          : "유보율 출처 검증 미완료. KIS 유보율 값의 단위와 계산식에 대한 검증이 완료되지 않아 현재는 유보율 기준을 통과로 판정하지 않습니다. 이 설정에서는 바닥매수 스캔을 실행해도 확정 신호가 생성되지 않습니다. (측정값 자체는 있으나 판정에 반영하지 않음)",
    },
  ];
}

export const SAMPLE_SIGNALS: SampleSignal[] = [
  {
    code: "000001",
    name: "샘플전자",
    fundStatus: "unknown", // 유보율 게이트가 꺼져 있는 실제 동작을 반영(항상 unknown)
    rsi14: 24.8,
    dropFromHighPct: -27.4,
    buyPrice: 54200,
    buyDate: "2026-10-20",
    firstSeenDate: "2026-10-17", // 같은 종목이 더 이른 날짜에도 신호를 냈던 경우(샘플)
    criteria: criteriaFor({ rsi14: 24.8, dropFromHighPct: -27.4, bullish: true, per: 11.2, debtRatio: 88.4, reserveRatioRaw: 850.3 }), // 측정값은 있으나 출처 미검증(샘플)
    finalReason: "기술적 조건 전부 충족, 재무 필터는 유보율 검증 전이라 최종 판단불가(샘플)",
  },
  {
    code: "000002",
    name: "예시바이오",
    fundStatus: "unknown",
    rsi14: 28.1,
    dropFromHighPct: -22.6,
    buyPrice: 18900,
    buyDate: "2026-10-20",
    firstSeenDate: "2026-10-20",
    criteria: criteriaFor({ rsi14: 28.1, dropFromHighPct: -22.6, bullish: true, per: null, debtRatio: null, reserveRatioRaw: null }), // 측정값 자체가 없음(조회 실패, 샘플)
    finalReason: "PER·부채비율 조회 실패로 재무 판단불가(샘플)",
  },
  {
    code: "000003",
    name: "가상테크",
    fundStatus: "unknown",
    rsi14: 32.5,
    dropFromHighPct: -31.2,
    buyPrice: 7420,
    buyDate: "2026-10-19",
    firstSeenDate: "2026-10-19",
    criteria: criteriaFor({ rsi14: 32.5, dropFromHighPct: -31.2, bullish: true, per: 22.1, debtRatio: 161.3, reserveRatioRaw: 620.0 }), // 측정값은 있으나 출처 미검증(샘플)
    finalReason: "RSI 미충족(32.5 ≥ 30), PER·부채비율도 기준 초과 — 기술 조건 탈락(샘플)",
  },
];

// 미청산 포지션(샘플) — 아직 5거래일이 안 지난 종목의 현재 평가손익
export type OpenPosition = { code: string; name: string; unrealizedPct: number };
export const SAMPLE_OPEN_POSITIONS: OpenPosition[] = [
  { code: "000001", name: "샘플전자", unrealizedPct: 2.1 },
  { code: "000002", name: "예시바이오", unrealizedPct: -1.8 },
];

// 두 기법을 같은 기준(5거래일 보유, 매수일 종가 기준, 동일 수수료·슬리피지 가정)으로
// 비교하기 위한 요약 지표 — 전부 샘플 값이며 실제 계산 로직은 아직 연결하지 않았다.
export type StrategyStats = {
  key: "golgoo" | "golgoo2";
  label: string;
  tradeCount: number;
  winRate: number; // %
  avgReturnPct: number;
  cumulativeReturnPct: number;
  maxDrawdownPct: number;
};

export const SAMPLE_STRATEGY_STATS: StrategyStats[] = [
  { key: "golgoo", label: "골구(기존, 뉴스 기반)", tradeCount: 42, winRate: 54.8, avgReturnPct: 1.2, cumulativeReturnPct: 18.4, maxDrawdownPct: -9.1 },
  { key: "golgoo2", label: "골구2(바닥매수)", tradeCount: 17, winRate: 58.8, avgReturnPct: 1.6, cumulativeReturnPct: 12.1, maxDrawdownPct: -6.4 },
];
