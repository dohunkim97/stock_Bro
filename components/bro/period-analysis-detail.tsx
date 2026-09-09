import Link from "next/link";
import { renderBold } from "@/components/ui/rich-text";
import { chgColorVar, formatChg } from "@/lib/format";
import type { CandidateResult } from "@/lib/period-analysis";

const rowStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "10px 12px",
};

function ResultRow({ r }: { r: CandidateResult }) {
  const nameBlock = (
    <span style={{ fontWeight: 700, fontSize: 12.5 }}>
      {r.name}
      {r.code && <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)", marginLeft: 5 }}>({r.code})</span>}
    </span>
  );
  return (
    <div style={rowStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {r.code ? (
          <Link href={`/stock?code=${r.code}`} style={{ textDecoration: "none", color: "inherit" }}>
            {nameBlock}
          </Link>
        ) : (
          nameBlock
        )}
        {r.finalChangePct !== null ? (
          <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 13, color: chgColorVar(r.finalChangePct) }}>
            {formatChg(r.finalChangePct)}
          </span>
        ) : (
          <span style={{ fontSize: 10.5, color: "var(--faint)" }}>추적 불가</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 4 }}>당시 추천 근거: {renderBold(r.reasoning)}</div>
      {r.explanation && (
        <div style={{ fontSize: 11.5, color: "var(--text)", marginTop: 6, lineHeight: 1.55 }}>{renderBold(r.explanation)}</div>
      )}
    </div>
  );
}

// 주간분석/월간분석 상세 — 총평 + 오른 종목/내린 종목으로 나눠서 보여준다.
// results는 이미 lib/period-analysis.ts가 등락폭 순으로 최대 12개까지만
// explanation을 채워뒀고(나머지는 적중률 통계에만 포함), 여기서는 그
// 순서를 그대로 오른/내린으로 다시 나누기만 한다.
export function PeriodAnalysisDetail({
  summary,
  candidateHitRate,
  results,
}: {
  summary: string;
  candidateHitRate: number | null;
  results: CandidateResult[];
}) {
  const sorted = [...results].sort((a, b) => (b.finalChangePct ?? -Infinity) - (a.finalChangePct ?? -Infinity));
  const risers = sorted.filter((r) => (r.finalChangePct ?? 0) > 0);
  const fallers = sorted.filter((r) => (r.finalChangePct ?? 0) <= 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          background: "var(--panel2)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 12.5 }}>총평</span>
          {candidateHitRate !== null && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--accent)",
                background: "var(--accent-soft)",
                borderRadius: 20,
                padding: "2px 9px",
              }}
            >
              적중률 {Math.round(candidateHitRate * 100)}% ({results.filter((r) => r.hit).length}/{results.length})
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--text)" }}>{renderBold(summary)}</p>
      </div>

      {risers.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--up)", marginBottom: 8 }}>📈 오른 종목 ({risers.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {risers.map((r) => (
              <ResultRow key={r.name} r={r} />
            ))}
          </div>
        </div>
      )}

      {fallers.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--down)", marginBottom: 8 }}>📉 내린 종목 ({fallers.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {fallers.map((r) => (
              <ResultRow key={r.name} r={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
