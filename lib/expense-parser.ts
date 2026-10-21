// "AI 없는 지출 기록 엔진" — 사용자 요청(2026-10-21): "점심 9000원"처럼 단순한
// 지출/수입 보고까지 매번 LLM(Claude)을 호출하는 건 토큰 낭비다. 정규식+
// 키워드 사전으로 금액·방향(지출/수입)·카테고리·날짜를 뽑을 수 있는 아주
// 명확한 경우에만 LLM을 건너뛰고 바로 기록한다. 조금이라도 애매하면(금액이
// 여러 개, 방향을 모르겠음, 종목/이체처럼 일반 지출이 아닌 걸로 보임 등)
// null을 돌려줘서 호출부(lib/telegram-chat.ts)가 기존 LLM 경로로 넘기게
// 한다 — "해석 실패 시 추측해서 저장하지 마" 원칙 그대로, 애매하면 아예
// 아무것도 안 하고 LLM에게 넘기지 섣불리 기록하지 않는다.

import { todayISO, offsetCalendarDays } from "@/lib/dates";

export type ParsedTransaction = {
  direction: "expense" | "income";
  amount: number;
  category: string;
  memo: string | null;
  date: string;
};

// 콤마는 천 단위 구분으로만 쓰인다고 가정하고 먼저 제거 — "12,000원"을
// 하나의 숫자로 읽기 위함(쉼표가 섞인 채로 정규식에 넣으면 "12"만 잡힘).
function stripThousandCommas(text: string): string {
  return text.replace(/(\d),(\d{3})(?=\D|$)/g, "$1$2").replace(/(\d),(\d{3})(?=\D|$)/g, "$1$2");
}

const UNIT_MULTIPLIER: Record<string, number> = { 억: 100_000_000, 만: 10_000, 천: 1_000 };
const AMOUNT_RE = /(\d+(?:\.\d+)?)\s*(억|만|천)?\s*원/g;

// 메시지 안의 "...원" 패턴을 전부 찾는다 — 정확히 하나만 나와야 안전하게
// 단일 거래로 본다(두 개 이상이면 "과자 5만원, 음료 2만원"처럼 여러 건일
// 수 있는데, 그건 이미 LLM 경로가 여러 번 도구를 호출해서 처리하므로 — 이
// 규칙 기반 경로는 "하나로 명확한 경우"만 맡고 섣불리 나눠 처리하지 않는다.
function findSingleAmount(text: string): number | null {
  const cleaned = stripThousandCommas(text);
  const matches = [...cleaned.matchAll(AMOUNT_RE)];
  if (matches.length !== 1) return null;
  const [, numStr, unit] = matches[0];
  const n = Number(numStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  const amount = Math.round(n * (unit ? UNIT_MULTIPLIER[unit] : 1));
  return amount > 0 ? amount : null;
}

// 이 메시지가 평범한 지출/수입 보고가 아니라 다른 경로로 가야 한다고
// 보이면 전부 null로 보내 LLM이 맥락을 보고 판단하게 한다 — 주식 매수
// (record_holding_purchase), 계좌이체/카드대금납부(이중 집계 위험, 사용자
// 기획서 2번 요구사항), 질문형 문장(기록이 아니라 질문) 등.
const EXCLUDE_RE = /(이체|송금|계좌이체|예금|적금|카드값|카드대금|결제대금|상환|대출|주식|매수|매도|\?|뭐야|어때|알려줘|추천해|해줘|할까)/;

const INCOME_HINT_RE = /(월급|부업|보너스|이자|배당|들어왔|벌었|받았|입금)/;
const EXPENSE_HINT_RE = /(썼|지출|결제|구매|샀)/;

// 카테고리 사전 — EXPENSE_CATEGORIES/INCOME_CATEGORIES(lib/finance-
// constants.ts)의 실제 분류명으로만 매핑한다. 못 찾으면 "기타"(방향 자체가
// 확실하면 카테고리를 모른다고 기록을 포기하지 않는다 — 사용자 기획서
// "해석 실패 시 추측해서 저장하지 마"는 금액/방향에 적용, 카테고리는
// '기타'가 안전한 기본값).
const EXPENSE_CATEGORY_KEYWORDS: [string, string[]][] = [
  ["주거", ["월세", "관리비", "전기세", "수도세", "가스비", "공과금"]],
  ["식비", ["점심", "저녁", "아침", "식사", "밥", "마트", "장보기", "식료품", "편의점"]],
  ["외식", ["카페", "커피", "스타벅스", "치킨", "배달", "식당", "술", "회식", "피자"]],
  ["교통", ["택시", "버스", "지하철", "기름값", "주유", "하이패스", "ktx", "톨게이트", "교통비"]],
  ["통신", ["통신비", "휴대폰", "핸드폰", "인터넷요금", "요금제"]],
  ["보험", ["보험료", "보험"]],
  ["의료", ["병원", "약국", "약값", "치과", "진료비"]],
  ["쇼핑", ["옷", "신발", "쇼핑", "쿠팡", "무신사", "온라인쇼핑"]],
  ["여가", ["영화", "게임", "여행", "놀이공원", "노래방", "공연"]],
  ["교육", ["학원", "책", "강의", "등록금", "교재"]],
  ["구독", ["넷플릭스", "유튜브프리미엄", "멜론", "구독료", "구독"]],
];
const INCOME_CATEGORY_KEYWORDS: [string, string[]][] = [
  ["월급", ["월급", "급여"]],
  ["부업", ["부업", "알바", "프리랜스"]],
  ["보너스", ["보너스", "성과급", "상여금"]],
  ["이자·배당", ["이자", "배당"]],
];

function matchCategory(text: string, dict: [string, string[]][]): string | null {
  const lower = text.toLowerCase();
  for (const [category, keywords] of dict) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) return category;
  }
  return null;
}

function resolveDate(text: string): string {
  if (/그제|그저께/.test(text)) return offsetCalendarDays(todayISO(), -2);
  if (/어제/.test(text)) return offsetCalendarDays(todayISO(), -1);
  return todayISO();
}

// 메시지가 "확실히 단순한" 단일 지출/수입 보고일 때만 결과를 돌려준다.
// stockNames는 StockMaster에서 실제로 발견된 종목명(호출부가 lib/chat-
// stock-report.ts의 findMentionedStocks로 미리 찾아서 넘겨준다) — 종목이
// 하나라도 언급됐으면 주식 매수 보고일 수 있으니 규칙 기반 경로를 포기한다.
export function parseSimpleTransaction(rawText: string, mentionedStockCount: number): ParsedTransaction | null {
  const text = rawText.trim();
  if (text.length === 0 || text.length > 40) return null; // 너무 길면 단순 보고가 아닐 가능성이 커 LLM에 맡긴다
  if (mentionedStockCount > 0) return null;
  if (EXCLUDE_RE.test(text)) return null;

  const amount = findSingleAmount(text);
  if (amount === null) return null;

  const isIncome = INCOME_HINT_RE.test(text);
  const isExpense = EXPENSE_HINT_RE.test(text) || matchCategory(text, EXPENSE_CATEGORY_KEYWORDS) !== null;
  // 방향이 둘 다 안 잡히거나(예: "9000원이 있어") 둘 다 잡히면(모순) 애매한
  // 거라 LLM에게 넘긴다.
  if (isIncome === isExpense) return null;

  const direction: "expense" | "income" = isIncome ? "income" : "expense";
  // matchCategory는 EXPENSE_CATEGORY_KEYWORDS/INCOME_CATEGORY_KEYWORDS의 키만
  // 돌려주고 그 키들은 전부 EXPENSE_CATEGORIES/INCOME_CATEGORIES(lib/
  // finance-constants.ts)에 실제로 있는 값이니, 못 찾으면 "기타"(둘 다에
  // 포함된 공통 분류)로 — 항상 유효한 카테고리가 나온다.
  const category = (isIncome ? matchCategory(text, INCOME_CATEGORY_KEYWORDS) : matchCategory(text, EXPENSE_CATEGORY_KEYWORDS)) ?? "기타";

  return { direction, amount, category, memo: null, date: resolveDate(text) };
}
