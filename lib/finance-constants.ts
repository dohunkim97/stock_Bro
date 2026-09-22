// 수입/지출 카테고리 목록 — lib/finance-engine.ts(prisma 포함, 서버 전용)
// 와 별도 파일로 뺀 이유는 lib/finance-goal-math.ts와 같다: 클라이언트
// 컴포넌트(components/nest/cashflow-panel.tsx의 카테고리 드롭다운)가
// prisma를 브라우저 번들에 끌고 들어가지 않고도 이 목록을 써야 해서.
export const INCOME_CATEGORIES = ["월급", "부업", "보너스", "이자·배당", "기타"] as const;
export const EXPENSE_CATEGORIES = [
  "주거", "식비", "외식", "교통", "통신", "보험", "의료", "쇼핑", "여가", "교육", "구독", "기타",
] as const;
