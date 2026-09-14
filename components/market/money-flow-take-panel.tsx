import Link from "next/link";
import { getLatestMoneyFlowTake, parseMoneyFlowCandidates } from "@/lib/money-flow-take";
import { renderBold } from "@/components/ui/rich-text";
import { RankBadge } from "./rank-badge";
import { BasisLabel } from "./basis-label";
import { basisLabelFromRows } from "@/lib/data-freshness";

// Self-contained like WeeklyPredictionPanel — reads whatever the latest
// sync generated (lib/sync-runner.ts), not scoped to the date being browsed
// (그래서 basisLabel을 꼭 보여준다 — 지금 보고 있는 날짜와 실제로 이 의견이
// 만들어진 날짜가 다를 수 있다는 걸 사용자가 알 수 있게).
export async function MoneyFlowTakePanel() {
  const take = await getLatestMoneyFlowTake();
  if (!take) return null;

  const candidates = parseMoneyFlowCandidates(take.candidates);
  const basisLabel = basisLabelFromRows([take]);

  return (
    <section
      style={{
        background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
        border: "1px solid var(--border2)",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg, var(--accent), var(--up))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0d13",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            G
          </div>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--accent)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Golgoo · 자금 흐름 기반 투자 방향
          </span>
        </span>
        <BasisLabel label={basisLabel} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: candidates.length > 0 ? "1fr 1fr" : "1fr",
          gap: 16,
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>설명</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--text)" }}>{renderBold(take.summary)}</p>
        </div>

        {candidates.length > 0 && (
          <div
            style={{
              padding: "14px 16px",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>추천 종목</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {candidates.map((c, i) => (
                <Link
                  key={c.name}
                  href={c.code ? `/stock?code=${c.code}` : "/stock"}
                  className="hover-accent-border"
                  style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 13, lineHeight: 1.55 }}
                >
                  <RankBadge rank={i + 1} />
                  <span>
                    <span style={{ fontWeight: 700, marginRight: 5 }}>{c.name}</span>
                    <span style={{ color: "var(--text)" }}>{renderBold(c.reasoning)}</span>
                    {c.chartNote && (
                      <span style={{ color: "var(--faint)", fontSize: 11.5, marginLeft: 6 }}>· 차트: {c.chartNote}</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
