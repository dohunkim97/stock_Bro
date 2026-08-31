// 4개 자금흐름 패널(시장 관심 상위 테마/테마별 종목, 순매수·순매도 상위
// 테마/테마별 종목)이 전부 같은 스타일의 순위 배지를 쓰도록 공용화 — 1위는
// 강조색, 나머지는 중립색.
export function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      style={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1px 5px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "var(--mono)",
        whiteSpace: "nowrap",
        background: rank === 1 ? "var(--accent)" : "var(--panel2)",
        color: rank === 1 ? "#0a0d13" : "var(--dim)",
      }}
    >
      {rank}위
    </span>
  );
}
