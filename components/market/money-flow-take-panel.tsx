import { getLatestMoneyFlowTake } from "@/lib/money-flow-take";
import { renderBold } from "@/components/ui/rich-text";

// Self-contained like WeeklyPredictionPanel — reads whatever the latest
// sync generated (lib/sync-runner.ts), not scoped to the date being browsed.
export async function MoneyFlowTakePanel() {
  const take = await getLatestMoneyFlowTake();
  if (!take) return null;

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

      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75, color: "var(--text)", maxWidth: 900 }}>
        {renderBold(take.summary)}
      </p>
    </section>
  );
}
