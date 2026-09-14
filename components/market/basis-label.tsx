// 마켓 페이지 각 구역(TOP종목/업종상위/테마별 자금흐름 등)에 붙이는 "OO시
// 기준" 캡션 — lib/data-freshness.ts가 만든 문구를 그대로 보여주기만 하는
// 순수 표시용 컴포넌트. label이 null(데이터가 아예 없어서 기준 시각도 없는
// 경우)이면 아무것도 안 그린다.
export function BasisLabel({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <span style={{ fontSize: 10, color: "var(--faint)", fontFamily: "var(--mono)", fontWeight: 500 }}>{label}</span>
  );
}
