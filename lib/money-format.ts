// 금액 입력용 순수 포맷 함수 — 숫자 입력칸에 3자리마다 쉼표를 넣고, 입력한 금액을
// 한글로 읽어주는 데 쓴다(components/ui/money-input.tsx). prisma 등 서버 의존이
// 없어 클라이언트 컴포넌트에서 바로 import할 수 있다.

// "1,234,567" 같은 입력에서 숫자만 남긴다. 금액은 원 단위 정수라 소수점은 버린다.
export function digitsOnly(input: string): string {
  return input.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

export function withCommas(digits: string): string {
  return digits ? Number(digits).toLocaleString("en-US") : "";
}

const DIGIT = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

// 0~9999를 한글로 — 천·백·십 자리의 1은 생략("천", "백", "십"), 일의 자리는 그대로("일").
function readGroup(n: number): string {
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor(n / 100) % 10;
  const tens = Math.floor(n / 10) % 10;
  const ones = n % 10;
  const unit = (d: number, u: string) => (d === 0 ? "" : d === 1 ? u : `${DIGIT[d]}${u}`);
  return `${unit(thousands, "천")}${unit(hundreds, "백")}${unit(tens, "십")}${DIGIT[ones]}`;
}

// 1000000 → "백만원", 10000000 → "천만원", 12345678 → "천이백삼십사만 오천육백칠십팔원".
// 0 이하이거나 너무 큰 수(조 단위를 넘어 9999조 이상)는 빈 문자열.
export function toKoreanMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0 || value >= 1e16) return "";
  const n = Math.floor(value);
  const parts: string[] = [];
  const units: [number, string][] = [
    [1e12, "조"],
    [1e8, "억"],
    [1e4, "만"],
  ];
  let rest = n;
  for (const [size, label] of units) {
    const group = Math.floor(rest / size);
    rest %= size;
    if (group === 0) continue;
    // "일만"보다 "만"이 자연스럽다(만 원). 조·억은 "일억", "일조"로 읽는다.
    parts.push(label === "만" && group === 1 ? "만" : `${readGroup(group)}${label}`);
  }
  if (rest > 0) parts.push(readGroup(rest));
  return `${parts.join(" ")}원`;
}
