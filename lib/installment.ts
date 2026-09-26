// 할부 계산 — 순수 함수라 화면의 미리보기(components/nest/cashflow-panel.tsx)와
// 서버 저장(app/api/finance/expense)이 똑같은 계산을 쓴다. 서버는 클라이언트가 보낸
// 회차별 금액을 믿지 않고 총액·개월수·이율만 받아 여기서 다시 계산한다.

export const MIN_INSTALLMENT_MONTHS = 2;
export const MAX_INSTALLMENT_MONTHS = 60;

export type InstallmentPlan = {
  months: number;
  payments: number[]; // 회차별 납부액(원, 정수) — 길이 = months
  totalPaid: number;
  interest: number; // totalPaid - 원금
};

// annualRatePct가 0이면 무이자 — 원금을 개월 수로 나누고 남는 몇 원은 1회차에 얹는다.
// 0보다 크면 원리금균등(매달 같은 금액을 내는 일반 카드 할부/대출 방식)이고, 반올림 때문에
// 생기는 자잘한 차이는 마지막 회차가 흡수해 총액이 정확히 맞게 한다.
export function calcInstallment(principal: number, months: number, annualRatePct = 0): InstallmentPlan | null {
  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isInteger(months) || months < MIN_INSTALLMENT_MONTHS || months > MAX_INSTALLMENT_MONTHS) return null;
  const rate = Number.isFinite(annualRatePct) && annualRatePct > 0 ? annualRatePct : 0;
  const p = Math.round(principal);

  let payments: number[];
  if (rate === 0) {
    const base = Math.floor(p / months);
    payments = Array.from({ length: months }, () => base);
    payments[0] += p - base * months;
  } else {
    const r = rate / 100 / 12;
    const monthly = Math.round((p * r) / (1 - Math.pow(1 + r, -months)));
    payments = Array.from({ length: months }, () => monthly);
    // 마지막 회차 = 원리금 총액 계산값 - 앞 회차 합계 (반올림 오차 정리)
    const exactTotal = Math.round(((p * r) / (1 - Math.pow(1 + r, -months))) * months);
    payments[months - 1] = exactTotal - monthly * (months - 1);
  }
  const totalPaid = payments.reduce((s, v) => s + v, 0);
  return { months, payments, totalPaid, interest: totalPaid - p };
}

// YYYY-MM-DD에 n개월을 더한다. 31일에 한 달을 더하면 말일(예: 2/28)로 맞춘다.
export function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + n;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12; // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
