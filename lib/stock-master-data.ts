export type StockMasterSeed = {
  name: string;
  code: string;
  market: "코스피" | "코스닥";
  sector: string;
  price: string;
  changePct: number;
};

export const KR_STOCKS: StockMasterSeed[] = [
  { name: "한미반도체", code: "042700", market: "코스닥", sector: "반도체", price: "148,500", changePct: 6.06 },
  { name: "삼성전자", code: "005930", market: "코스피", sector: "반도체", price: "71,200", changePct: 1.85 },
  { name: "SK하이닉스", code: "000660", market: "코스피", sector: "반도체", price: "245,000", changePct: 4.21 },
  { name: "제주반도체", code: "080220", market: "코스닥", sector: "반도체", price: "9,840", changePct: 12.34 },
  { name: "이수페타시스", code: "007660", market: "코스피", sector: "반도체", price: "48,300", changePct: 9.87 },
  { name: "HPSP", code: "403870", market: "코스닥", sector: "반도체", price: "38,150", changePct: 8.72 },
  { name: "리노공업", code: "058470", market: "코스닥", sector: "반도체", price: "212,000", changePct: 5.21 },
  { name: "두산에너빌리티", code: "034020", market: "코스피", sector: "원전·에너지", price: "21,450", changePct: 3.38 },
  { name: "두산로보틱스", code: "454910", market: "코스피", sector: "로봇", price: "78,600", changePct: 4.9 },
  { name: "LG에너지솔루션", code: "373220", market: "코스피", sector: "2차전지", price: "385,000", changePct: -1.12 },
  { name: "에코프로비엠", code: "247540", market: "코스닥", sector: "2차전지", price: "168,000", changePct: -2.31 },
  { name: "현대차", code: "005380", market: "코스피", sector: "자동차", price: "248,500", changePct: 0.61 },
  { name: "NAVER", code: "035420", market: "코스피", sector: "인터넷", price: "178,000", changePct: 1.44 },
  { name: "카카오", code: "035720", market: "코스피", sector: "인터넷", price: "41,300", changePct: -0.72 },
  { name: "셀트리온", code: "068270", market: "코스피", sector: "바이오", price: "189,500", changePct: 2.1 },
  { name: "POSCO홀딩스", code: "005490", market: "코스피", sector: "철강", price: "402,000", changePct: -0.35 },
  { name: "HD현대중공업", code: "329180", market: "코스피", sector: "조선", price: "196,800", changePct: 3.02 },
];

// Sample seed for "today" (2026-07-06) so the app has data on first load,
// matching the design mockup's day-view numbers.
export const SEED_DATE = "2026-07-06";

export const SEED_TOP_VOLUME = [
  { rank: 1, name: "두산에너빌리티", price: "21,450", changePct: 3.38, volume: "3,120만주" },
  { rank: 2, name: "삼성전자", price: "71,200", changePct: 1.85, volume: "2,180만주" },
  { rank: 3, name: "제주반도체", price: "9,840", changePct: 12.34, volume: "1,860만주" },
  { rank: 4, name: "한미반도체", price: "148,500", changePct: 6.06, volume: "940만주" },
  { rank: 5, name: "SK하이닉스", price: "245,000", changePct: 4.21, volume: "620만주" },
];

export const SEED_TOP_GAINERS = [
  { rank: 1, name: "제주반도체", price: "9,840", changePct: 12.34 },
  { rank: 2, name: "이수페타시스", price: "48,300", changePct: 9.87 },
  { rank: 3, name: "HPSP", price: "38,150", changePct: 8.72 },
  { rank: 4, name: "한미반도체", price: "148,500", changePct: 6.06 },
  { rank: 5, name: "리노공업", price: "212,000", changePct: 5.21 },
];
