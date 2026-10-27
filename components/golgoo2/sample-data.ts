// 골구2(바닥매수 기법 독립 실험) 화면 전용 샘플 데이터 — 1단계(화면 작업)
// 승인 범위: 실제 DB/KIS/data.go.kr에 연결하지 않고, 전부 하드코딩된 값만 쓴다.
// 기존 /bro(골구)·기존 Prisma 모델·lib/* 함수는 이 파일에서 전혀 import하지 않는다.
// 실제 데이터 연결은 2단계(재무 로직)·3단계(테스트 DB) 이후 별도 승인 대상이다.

export type FundStatus = "pass" | "unknown";

export type SampleSignal = {
  code: string;
  name: string;
  fundStatus: FundStatus;
  rsi14: number;
  dropFromHighPct: number;
  buyPrice: number;
  buyDate: string; // YYYY-MM-DD(샘플)
};

export const SAMPLE_SIGNALS: SampleSignal[] = [
  { code: "000001", name: "샘플전자", fundStatus: "pass", rsi14: 24.8, dropFromHighPct: -27.4, buyPrice: 54200, buyDate: "2026-10-20" },
  { code: "000002", name: "예시바이오", fundStatus: "unknown", rsi14: 28.1, dropFromHighPct: -22.6, buyPrice: 18900, buyDate: "2026-10-20" },
  { code: "000003", name: "가상테크", fundStatus: "pass", rsi14: 26.5, dropFromHighPct: -31.2, buyPrice: 7420, buyDate: "2026-10-19" },
  { code: "000004", name: "테스트화학", fundStatus: "pass", rsi14: 29.3, dropFromHighPct: -24.9, buyPrice: 112000, buyDate: "2026-10-19" },
  { code: "000005", name: "모의건설", fundStatus: "unknown", rsi14: 23.7, dropFromHighPct: -29.8, buyPrice: 3380, buyDate: "2026-10-16" },
  { code: "000006", name: "데모식품", fundStatus: "pass", rsi14: 27.9, dropFromHighPct: -20.5, buyPrice: 45600, buyDate: "2026-10-16" },
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
