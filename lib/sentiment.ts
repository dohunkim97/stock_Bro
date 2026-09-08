// 근거 문장 안에서 좋은 신호(매수/흑자/증가/상승)와 나쁜 신호(매도/적자/감소/
// 하락)를 같은 기준으로 판별하는 공용 유틸 — 국내 증시 관례(상승=빨강/하락=
// 파랑)를 따른다. 두 군데가 이 파일을 같이 쓴다:
//   - components/bro/detail-card.tsx: 문장 안의 해당 단어(와 바로 앞 숫자·
//     단위까지)를 통째로 색칠
//   - lib/candidate-detail.ts: 재료(4번) 항목처럼 자유 서술 문장의 (O)/(X)
//     판단을 LLM에게 다시 묻지 않고 이 단어 집계로 결정
// 두 곳이 서로 다른 단어 기준으로 판단하면 화면 색깔과 (O)/(X) 표시가
// 어긋나 보이니, 반드시 이 파일 하나만 고치면 둘 다 같이 바뀌게 한다.
export const POSITIVE_WORDS = ["순매수", "매수", "흑자", "증가", "상승"];
export const NEGATIVE_WORDS = ["순매도", "매도", "적자", "감소", "하락"];

const SENTIMENT_WORDS = [...POSITIVE_WORDS, ...NEGATIVE_WORDS].sort((a, b) => b.length - a.length);

// 단어 바로 앞에 붙은 숫자/단위(92억, 48%, -8.8% 등)까지 한 덩어리로 같이
// 잡는다 — 단어만 색칠하면 정작 중요한 수치가 그대로 안 보여서.
const QUANTITY = "[+\\-]?[0-9][0-9,]*(?:\\.[0-9]+)?%?(?:천|만|억|조)?원?";
export const SENTIMENT_REGEX = new RegExp(`((?:${QUANTITY}\\s*)?(?:${SENTIMENT_WORDS.join("|")}))`, "g");

// 정확히 그 단어여야만 색을 정하는 게 아니라, "92억 매수"처럼 숫자가 앞에
// 붙은 덩어리여도 끝이 그 단어면 색을 정한다 — endsWith라 "순매수"/"순매도"도
// 자연히 맞아떨어진다.
export function sentimentColorVar(token: string): "up" | "down" | null {
  for (const w of POSITIVE_WORDS) if (token.endsWith(w)) return "up";
  for (const w of NEGATIVE_WORDS) if (token.endsWith(w)) return "down";
  return null;
}

// 문장 안 긍정/부정 단어 등장 횟수를 세서 순수 데이터로 O/X를 정한다(LLM
// 재호출 없음) — 자유 서술 문장(재료 등)의 판단에 쓴다. 둘 다 없거나 정확히
// 같으면(중립/판단 불가) null.
export function sentimentVerdict(text: string): boolean | null {
  const matches = text.match(SENTIMENT_REGEX) ?? [];
  let score = 0;
  for (const raw of matches) {
    const color = sentimentColorVar(raw);
    if (color === "up") score += 1;
    else if (color === "down") score -= 1;
  }
  if (score === 0) return null;
  return score > 0;
}
