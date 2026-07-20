// The real 표준산업분류명 (KSIC) we pull from GetCorpBasicInfoService_V2 is
// precise but often long and jargon-y for a quick badge — e.g. "근무복_
// 작업복 및 유사 의복 제조업" instead of just "의류·섬유". This is a
// best-effort keyword mapping down to a shorter, friendlier label for
// display purposes only; the raw classification is still what's stored
// and used for grouping elsewhere.
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["반도체", ["반도체"]],
  ["전자·IT기기", ["전화기", "통신", "컴퓨터", "영상", "음향", "전자응용기기", "방송장비"]],
  ["전기·전자부품", ["전선", "케이블", "절연", "전자부품", "축전지", "전지"]],
  ["자동차", ["자동차"]],
  ["조선", ["선박", "보트", "강선"]],
  ["화학·소재", ["화학", "합성수지", "플라스틱", "고무", "석유", "정제"]],
  ["제약·바이오", ["의약품", "제약", "바이오", "의료용"]],
  ["의료기기", ["의료기기", "의료용 기기"]],
  ["의류·섬유", ["의복", "섬유", "직물", "신발", "가죽"]],
  ["식품·음료", ["식품", "음료", "육류", "수산물", "제과"]],
  ["건설", ["건설", "시설물", "토목", "건축"]],
  ["철강·금속", ["철강", "금속", "제철", "주조"]],
  ["기계·장비", ["기계", "장비 제조", "설비"]],
  ["금융", ["보험", "금융", "은행", "증권", "여신"]],
  ["유통·도소매", ["도매업", "소매업", "유통"]],
  ["에너지", ["발전업", "에너지", "전력"]],
  ["IT서비스", ["소프트웨어", "정보서비스", "시스템 통합", "포털"]],
  ["화장품", ["화장품"]],
  ["미디어·엔터", ["영화", "방송", "출판", "광고", "에니메이션", "애니메이션"]],
  ["운송·물류", ["운송", "해운", "항공", "물류", "화물"]],
  ["농림수산", ["농업", "임업", "어업", "축산"]],
];

export function simplifyIndustry(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "기타";
  if (trimmed === "기타") return "기타";

  for (const [label, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => trimmed.includes(k))) return label;
  }

  // No keyword match — fall back to the raw classification, trimmed to a
  // reasonable badge length rather than the full (sometimes very long) name.
  return trimmed.length > 12 ? `${trimmed.slice(0, 12)}…` : trimmed;
}
