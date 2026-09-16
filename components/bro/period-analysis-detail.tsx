import Link from "next/link";
import { renderBold } from "@/components/ui/rich-text";
import { chgColorVar, formatChg } from "@/lib/format";
import type { CandidateResult, CategoryStat } from "@/lib/period-analysis";

const rowStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "10px 12px",
};

// 5거래일 안에 목표가/손절가에 닿은 적이 있으면 그 사실을 눈에 띄게 —
// 그냥 "올랐다/내렸다"보다 "목표가 도달"/"손절가 도달"이 실제 매매
// 관점에서 훨씬 중요한 정보라 뱃지로 분리했다.
function OutcomeBadge({ hitTarget, hitStop }: { hitTarget: boolean; hitStop: boolean }) {
  if (!hitTarget && !hitStop) return null;
  const cfg = hitTarget ? { fg: "var(--up)", bg: "var(--up-soft)", label: "🎯 목표가 도달" } : { fg: "var(--down)", bg: "var(--down-soft)", label: "⚠️ 손절가 도달" };
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color: cfg.fg, background: cfg.bg, borderRadius: 20, padding: "2px 8px" }}>
      {cfg.label}
    </span>
  );
}

function ResultRow({ r }: { r: CandidateResult }) {
  const nameBlock = (
    <span style={{ fontWeight: 700, fontSize: 12.5 }}>
      {r.name}
      {r.code && <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)", marginLeft: 5 }}>({r.code})</span>}
    </span>
  );
  return (
    <div style={rowStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {r.code ? (
            <Link href={`/stock?code=${r.code}`} style={{ textDecoration: "none", color: "inherit" }}>
              {nameBlock}
            </Link>
          ) : (
            nameBlock
          )}
          <OutcomeBadge hitTarget={r.hitTarget} hitStop={r.hitStop} />
        </div>
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

// 항목별(시황/거래량/차트/재료/수급/재무) O/X 판단이 실제 수익률과 얼마나
// 갈렸는지 — O 평균이 X 평균보다 뚜렷이 높을수록 그 항목이 실제로 잘
// 맞았다는 뜻. 데이터가 없는(둘 다 0건) 항목은 아예 안 보여준다.
function CategoryStatsTable({ stats }: { stats: CategoryStat[] }) {
  const shown = stats.filter((s) => s.positiveCount > 0 || s.negativeCount > 0);
  if (shown.length === 0) return null;

  return (
    <div style={{ background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 10 }}>항목별 적중도 — 뭐가 실제로 잘 맞았나</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {shown.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5 }}>
            <span style={{ flex: "0 0 40px", fontWeight: 700, color: "var(--text)" }}>{s.label}</span>
            <span style={{ color: "var(--up)", fontFamily: "var(--mono)" }}>
              (O) {s.positiveCount > 0 ? `${s.positiveCount}건 ${formatChg(s.positiveAvgReturn ?? 0)}` : "-"}
            </span>
            <span style={{ color: "var(--dim)" }}>/</span>
            <span style={{ color: "var(--down)", fontFamily: "var(--mono)" }}>
              (X) {s.negativeCount > 0 ? `${s.negativeCount}건 ${formatChg(s.negativeAvgReturn ?? 0)}` : "-"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 다음 종목 선정에 실제로 반영되는 교훈(lib/weekly-prediction.ts가 이
// 리포트의 insights를 그대로 프롬프트에 넣음) — "그냥 보여주는 통계"가
// 아니라 "다음 예측이 실제로 참고하는 내용"이라는 걸 알 수 있게 문구로
// 명시.
function InsightsList({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  return (
    <div style={{ background: "var(--accent-soft)", border: "1px solid var(--border2)", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8, color: "var(--accent)" }}>
        💡 다음 예측에 반영된 교훈
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: "var(--text)" }}>
        {insights.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

// 주간분석/월간분석 상세 — 총평 + 항목별 적중도 + 다음 교훈 + 오른/내린
// 종목으로 나눠서 보여준다. results는 이미 lib/period-analysis.ts가 등락폭
// 순으로 최대 12개까지만 explanation을 채워뒀고(나머지는 적중률 통계에만
// 포함), 여기서는 그 순서를 그대로 오른/내린으로 다시 나누기만 한다.
export function PeriodAnalysisDetail({
  summary,
  candidateHitRate,
  results,
  categoryStats,
  insights,
}: {
  summary: string;
  candidateHitRate: number | null;
  results: CandidateResult[];
  categoryStats: CategoryStat[];
  insights: string[];
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

      <CategoryStatsTable stats={categoryStats} />
      <InsightsList insights={insights} />

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
