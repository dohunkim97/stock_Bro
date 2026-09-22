// 목표 달성 계산(GPT 설계 12-13번) — 순수 함수만 모아둔 파일. 일부러
// lib/finance-engine.ts와 분리했다: 그쪽은 prisma를 import해서 서버
// 전용인데, 이 계산들은 목표 화면의 "월 투자금 슬라이더를 움직이면
// 예상 달성일이 실시간으로 바뀌는" 인터랙션(클라이언트 컴포넌트,
// components/nest/goals-panel.tsx)에서도 그대로 써야 한다 — prisma가
// 섞인 모듈을 클라이언트 번들에 넣을 수 없어서 순수 계산만 여기 둔다.
//
// 월 복리 미래가치: FV = P(1+r)^n + PMT * ((1+r)^n - 1) / r
// 여기서 P=현재자산, r=월 기대수익률, n=개월수, PMT=월 투자금.

// 목표 달성까지 몇 개월 걸리는지 — "단순히 연 단위 공식으로 날짜를 찍지
// 말고 월별 시뮬레이션을 추천"(GPT 설계 12번)이라 한 달씩 굴려서 목표를
// 넘는 첫 달을 찾는다. 40년(480개월) 안에 못 넘으면 null(사실상 불가능).
export function estimateMonthsToGoal(
  currentAmount: number,
  targetAmount: number,
  monthlyContribution: number,
  annualReturnPct: number
): number | null {
  if (currentAmount >= targetAmount) return 0;
  if (monthlyContribution <= 0 && annualReturnPct <= 0) return null;
  const monthlyRate = annualReturnPct / 100 / 12;
  const MAX_MONTHS = 480;
  let balance = currentAmount;
  for (let m = 1; m <= MAX_MONTHS; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (balance >= targetAmount) return m;
  }
  return null;
}

// 목표일까지 남은 개월 수 기준으로 "얼마를 매달 넣어야 하는지" 역산 —
// PMT = (FV - P(1+r)^n) / (((1+r)^n - 1) / r). 이미 현재자산만으로 목표를
// 넘는다면 0(추가 납입 불필요).
export function requiredMonthlyContribution(
  currentAmount: number,
  targetAmount: number,
  monthsRemaining: number,
  annualReturnPct: number
): number | null {
  if (monthsRemaining <= 0) return null;
  const monthlyRate = annualReturnPct / 100 / 12;
  const growth = Math.pow(1 + monthlyRate, monthsRemaining);
  const remaining = targetAmount - currentAmount * growth;
  if (remaining <= 0) return 0;
  if (monthlyRate === 0) return remaining / monthsRemaining;
  return remaining / ((growth - 1) / monthlyRate);
}

export function monthsBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

// estimateMonthsToGoal의 "몇 개월 뒤"를 실제 "YYYY.MM" 날짜 라벨로 바꾼다.
export function monthsFromTodayLabel(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}
