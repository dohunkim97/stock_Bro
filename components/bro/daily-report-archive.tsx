import {
  getRecentBriefingDays,
  parseSectorNote,
  parseCandidates,
  SLOT_TITLE,
  type BriefingSlot,
} from "@/lib/market-briefing";
import { formatDateLabel } from "@/lib/dates";
import { renderBold } from "@/components/ui/rich-text";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
  height: "100%",
  overflowY: "auto",
};

const rowStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--accent)",
  fontFamily: "var(--mono)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: 10,
};

// A library-style archive on /bro's 리포트 tab — every day that had at least
// one AI briefing, most recent first, click to expand into that day's
// morning/중간/장마감 slots combined. Pure aggregation of what
// lib/market-briefing.ts already generates 3x/day — no extra LLM call.
export async function DailyReportArchive() {
  const days = await getRecentBriefingDays(14);
  if (days.length === 0) return null;

  return (
    <section style={panelStyle}>
      <div style={sectionTitleStyle}>📚 일간 리포트 · 모닝·중간·장마감 종합</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {days.map((day) => (
          <details key={day.date} className="no-marker" style={{ ...rowStyle, padding: 0 }}>
            <summary
              style={{
                cursor: "pointer",
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="chevron" style={{ fontSize: 10, color: "var(--faint)" }}>
                  ▶
                </span>
                <span style={{ fontWeight: 700 }}>{formatDateLabel(day.date)}</span>
              </span>
              <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10.5 }}>
                {day.slots.map((s) => SLOT_TITLE[s.slot as BriefingSlot]).join(" · ")}
              </span>
            </summary>
            <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              {day.slots.map((s) => {
                const note = parseSectorNote(s.sectorNote);
                const candidates = parseCandidates(s.candidates);
                return (
                  <div key={s.slot} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--accent)", marginBottom: 6 }}>
                      {SLOT_TITLE[s.slot as BriefingSlot]}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>{renderBold(s.summary)}</div>
                    {note && (
                      <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 6, lineHeight: 1.5 }}>
                        {note.theme && <span style={{ fontWeight: 700, color: "var(--text)" }}>{note.theme}: </span>}
                        {renderBold(note.note)}
                      </div>
                    )}
                    {candidates.length > 0 && (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 11.5, color: "var(--dim)", lineHeight: 1.6 }}>
                        {candidates.map((c, i) => (
                          <li key={i}>
                            {c.name && <span style={{ fontWeight: 700, color: "var(--text)" }}>{c.name}: </span>}
                            {renderBold(c.reason)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
