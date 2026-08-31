import Link from "next/link";
import { getLatestMoneyFlowTake, parseMoneyFlowCandidates } from "@/lib/money-flow-take";
import { renderBold } from "@/components/ui/rich-text";

// Self-contained like WeeklyPredictionPanel — reads whatever the latest
// sync generated (lib/sync-runner.ts), not scoped to the date being browsed.
export async function MoneyFlowTakePanel() {
  const take = await getLatestMoneyFlowTake();
  if (!take) return null;

  const candidates = parseMoneyFlowCandidates(take.candidates);

  return (
    <section
      style={{
        background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
        border: "1px solid var(--border2)",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
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
      </div>

      <p style={{ margin: candidates.length > 0 ? "0 0 18px" : 0, fontSize: 14.5, lineHeight: 1.75, color: "var(--text)", maxWidth: 900 }}>
        {renderBold(take.summary)}
      </p>

      {candidates.length > 0 && (
        <div
          style={{
            padding: "14px 16px",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            maxWidth: 900,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>추천 종목</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.map((c) => (
              <Link
                key={c.name}
                href={c.code ? `/stock?code=${c.code}` : "/stock"}
                className="hover-accent-border"
                style={{ fontSize: 13, lineHeight: 1.55, display: "block" }}
              >
                <span style={{ fontWeight: 700, marginRight: 5 }}>{c.name}</span>
                <span style={{ color: "var(--text)" }}>{renderBold(c.reasoning)}</span>
                {c.chartNote && (
                  <span style={{ color: "var(--faint)", fontSize: 11.5, marginLeft: 6 }}>· 차트: {c.chartNote}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
