import Link from "next/link";
import {
  getBriefingSlotsForDate,
  parseSectorNote,
  parseCandidates,
  BRIEFING_SLOTS,
  SLOT_TITLE,
  type BriefingSlot,
} from "@/lib/market-briefing";
import { todayISO } from "@/lib/dates";
import { SectorContributors } from "./sector-contributors";
import { renderBold } from "@/components/ui/rich-text";
import type { SectorEntry } from "@/lib/sector-aggregation";

const noteBoxStyle: React.CSSProperties = {
  padding: "14px 16px",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

const themeBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  background: "var(--accent-soft)",
  color: "var(--accent)",
  fontSize: 12,
  fontWeight: 700,
  padding: "3px 9px",
  borderRadius: 6,
  marginBottom: 8,
};

const candidateNumStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "var(--accent-soft)",
  color: "var(--accent)",
  fontSize: 10.5,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 1,
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 700,
    padding: "6px 13px",
    borderRadius: 20,
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent)" : "var(--panel)",
    color: active ? "#0a0d13" : "var(--dim)",
  };
}

export async function AiBriefing({
  date,
  slot,
  contributors = [],
}: {
  date: string;
  slot?: string;
  contributors?: SectorEntry[];
}) {
  const rows = await getBriefingSlotsForDate(date);

  if (rows.length === 0) {
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
        오늘의 AI 브리핑은 모닝(07:00)·중간(12:30)·장마감(15:40)에 자동 생성돼요. 아직 준비된 브리핑이 없어요.
      </section>
    );
  }

  const byRow = new Map(rows.map((r) => [r.slot as BriefingSlot, r]));
  // rows are ordered by createdAt asc, so the last one is the most recent —
  // that's the sensible default when no specific slot was requested.
  const requestedSlot = slot && byRow.has(slot as BriefingSlot) ? (slot as BriefingSlot) : rows[rows.length - 1].slot;
  const active = byRow.get(requestedSlot as BriefingSlot)!;

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

        <div style={{ display: "flex", gap: 6 }}>
          {BRIEFING_SLOTS.map((s) => {
            const row = byRow.get(s);
            if (!row) return null;
            return (
              <Link key={s} href={`/market?date=${date}&briefingSlot=${s}`} style={tabStyle(s === requestedSlot)}>
                {SLOT_TITLE[s]}
              </Link>
            );
          })}
        </div>
      </div>

      <p style={{ margin: "0 0 18px", fontSize: 14.5, lineHeight: 1.75, color: "var(--text)", maxWidth: 900 }}>
        {renderBold(active.summary)}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {(() => {
          const note = parseSectorNote(active.sectorNote);
          if (!note) return null;
          return (
            <div style={noteBoxStyle}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>지금 이 섹터·테마가 주목되는 이유</div>
              {note.theme && <span style={themeBadgeStyle}>{note.theme}</span>}
              <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.65 }}>{renderBold(note.note)}</div>
              <SectorContributors contributors={contributors} sectorLabel={note.theme ?? "관련 종목"} />
            </div>
          );
        })()}

        {(() => {
          const items = parseCandidates(active.candidates);
          if (items.length === 0) return null;
          return (
            <div style={noteBoxStyle}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>다음 관찰 포인트</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {items.map((it, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={candidateNumStyle}>{i + 1}</span>
                    <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                      {it.name && <span style={{ fontWeight: 700, marginRight: 5 }}>{it.name}</span>}
                      <span style={{ color: "var(--text)" }}>{renderBold(it.reason)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </section>
  );
}
