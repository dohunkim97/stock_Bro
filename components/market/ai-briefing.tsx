import { getBriefing } from "@/lib/market-briefing";
import { todayISO } from "@/lib/dates";

const noteBoxStyle: React.CSSProperties = {
  padding: "14px 16px",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

export async function AiBriefing({ date }: { date: string }) {
  const briefing = await getBriefing(date);

  if (!briefing) {
    // Quiet no-op for past dates that predate this feature — only worth a
    // hint when viewing today, where a briefing is actually expected soon.
    if (date !== todayISO()) return null;
    return (
      <section
        style={{
          background: "var(--panel)",
          border: "1px dashed var(--border2)",
          borderRadius: 16,
          padding: "18px 22px",
          fontSize: 13,
          color: "var(--faint)",
        }}
      >
        오늘의 AI 브리핑은 장마감 후 자동 생성돼요. 아직 준비되지 않았어요.
      </section>
    );
  }

  return (
    <section
      style={{
        background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
        border: "1px solid var(--border2)",
        borderRadius: 16,
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
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
          Golgoo AI · {date} 시장 브리핑
        </span>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: 14.5, lineHeight: 1.75, color: "var(--text)", maxWidth: 900 }}>
        {briefing.summary}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {briefing.sectorNote && (
          <div style={noteBoxStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>이 섹터가 강세였던 이유</div>
            <div style={{ fontSize: 13, color: "var(--faint)", lineHeight: 1.6 }}>{briefing.sectorNote}</div>
          </div>
        )}
        {briefing.candidates && (
          <div style={noteBoxStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>다음 관찰 포인트</div>
            <div style={{ fontSize: 13, color: "var(--faint)", lineHeight: 1.6 }}>{briefing.candidates}</div>
          </div>
        )}
      </div>
    </section>
  );
}
