import type { PortfolioOverview } from "@/lib/portfolio";
import { chgColorVar, formatChg } from "@/lib/format";

// lib/format.ts의 formatWon은 시가총액처럼 큰 수를 "1억"/"2조 3,456억" 식으로
// 축약하는 용도라 1억대 포트폴리오 안에서는 소수점 아래 억 단위가 뭉개진다
// (예: 1억 4,835만원이 그냥 "1억"으로 보임) — 여기서는 정확한 금액이 중요해서
// 콤마만 찍은 원 단위 그대로 보여준다.
function formatKRW(value: number): string {
  return `${Math.round(value).toLocaleString()}원`;
}

const barStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 28,
  background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
  border: "1px solid var(--border2)",
  borderRadius: 16,
  padding: "20px 26px",
  marginBottom: 20,
};

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--faint)", fontFamily: "var(--mono)", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: valueColor ?? "var(--text)", fontFamily: "var(--mono)" }}>
        {value}
      </div>
    </div>
  );
}

// 둥지 최상단 요약 바 — 로그인하자마자 총 시드/총 평가액/손익률/보유현금을
// 한눈에. lib/portfolio.ts의 computeOverview가 만든 값을 그대로 보여줄
// 뿐이라 이 컴포넌트 자체에는 계산 로직이 없다.
export function SummaryBar({ overview }: { overview: PortfolioOverview }) {
  return (
    <div style={barStyle}>
      <Stat label="총 시드" value={formatKRW(overview.totalSeed)} />
      <Stat label="총 평가액" value={formatKRW(overview.totalValuation)} />
      {overview.profitPct !== null && (
        <Stat label="손익률" value={formatChg(overview.profitPct)} valueColor={chgColorVar(overview.profitPct)} />
      )}
      <Stat label="보유현금" value={formatKRW(overview.cashAmount)} />
    </div>
  );
}
