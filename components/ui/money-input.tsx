"use client";

import { digitsOnly, toKoreanMoney, withCommas } from "@/lib/money-format";

// 금액/수량 입력칸 — 입력 중에 3자리마다 쉼표를 넣고, 아래에 한글로 읽어준다
// (1000000 → "백만 원"). 부모는 쉼표 없는 숫자 문자열(digits)만 들고 있으면 되고,
// 제출할 때 Number(value)로 바꿔 쓴다. 금액이 아닌 수량 같은 칸은 korean={false}로
// 한글 읽기만 끈다(쉼표는 유지).
export function MoneyInput({
  value,
  onValueChange,
  placeholder,
  style,
  wrapperStyle,
  korean = true,
  unit = "원",
}: {
  value: string;
  onValueChange: (digits: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
  korean?: boolean;
  unit?: string;
}) {
  const reading = korean && value ? toKoreanMoney(Number(value)).replace(/원$/, unit) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, ...wrapperStyle }}>
      <input
        value={withCommas(value)}
        onChange={(e) => onValueChange(digitsOnly(e.target.value))}
        placeholder={placeholder}
        inputMode="numeric"
        style={{ width: "100%", ...style }}
      />
      {reading && <div style={{ fontSize: 10.5, color: "var(--accent)", lineHeight: 1.3, paddingLeft: 2 }}>{reading}</div>}
    </div>
  );
}
