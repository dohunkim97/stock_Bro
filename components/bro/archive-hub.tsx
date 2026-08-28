import { getRecentPredictionDays } from "@/lib/prediction-scoring";
import { getRecentBriefingDays, parseSectorNote, parseCandidates, SLOT_TITLE, type BriefingSlot } from "@/lib/market-briefing";
import { getRecentChatDays } from "@/lib/chat-history";
import { formatDateLabel } from "@/lib/dates";
import { renderBold } from "@/components/ui/rich-text";
import { formatChg } from "@/lib/format";
import { ArchiveHubClient, type ArchiveRow } from "./archive-hub-client";
import { ArchivePredictionDetail } from "./archive-prediction-detail";

// Strips the **bold** markers LLM-written summaries use — fine inside the
// expanded detail (rendered via renderBold there), but the collapsed row's
// one-line preview shouldn't show literal asterisks.
function plainPreview(text: string): string {
  return text.replace(/\*\*/g, "");
}

// 기록보관소 — fetches all three archives' data once, builds each into the
// same flat date|요약 row shape, and hands them to the client tab shell
// (ArchiveHubClient). Replaces the three separate, differently-styled
// archive sections that used to be scattered around /bro.
export async function ArchiveHub() {
  const [predictions, dailyDays, chatDays] = await Promise.all([
    getRecentPredictionDays(14),
    getRecentBriefingDays(14),
    getRecentChatDays(14),
  ]);

  // Unlike the old weekly hit/miss scoring, a daily prediction row shows up
  // here as soon as it's published (even yesterday's, still mid-way through
  // its 5-거래일 window) — so the collapsed row's meta shows each candidate's
  // cumulative % so far. The expanded detail mirrors today's live report
  // exactly (same DetailCard: 사업요약·시황·수급·재무·전략가이드 +
  // 누적수익률 + 기술적 시그널) via ArchivePredictionDetail — but that per-
  // candidate detail is heavy (LLM + several market API calls per stock), so
  // it's fetched lazily only when a card is actually opened, not for all 14
  // days up front.
  const predictionRows: ArchiveRow[] = predictions.map((h) => {
    const latestByCode = h.candidates.map((c) => (c.series.length > 0 ? c.series[c.series.length - 1] : null));
    const avgChange =
      latestByCode.filter((p): p is NonNullable<typeof p> => p !== null).length > 0
        ? latestByCode.reduce((sum, p) => sum + (p?.changePct ?? 0), 0) / latestByCode.filter((p) => p !== null).length
        : null;
    return {
      key: h.forDate,
      date: h.label,
      summary: plainPreview(h.summary),
      meta: avgChange !== null ? `종목 평균 ${formatChg(avgChange)}` : "추적 데이터 없음",
      detail: (
        <ArchivePredictionDetail forDate={h.forDate} summary={h.summary} sectors={h.sectors} candidates={h.candidates} />
      ),
    };
  });

  const dailyRows: ArchiveRow[] = dailyDays.map((day) => ({
    key: day.date,
    date: formatDateLabel(day.date),
    summary: plainPreview(day.slots[day.slots.length - 1]?.summary ?? ""),
    meta: day.slots.map((s) => SLOT_TITLE[s.slot as BriefingSlot]).join(" · "),
    detail: (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
    ),
  }));

  const chatRows: ArchiveRow[] = chatDays.map((day) => {
    const firstUser = day.messages.find((m) => m.role === "user");
    return {
      key: day.date,
      date: formatDateLabel(day.date),
      summary: firstUser?.text ?? "",
      meta: `대화 ${day.messages.length}건`,
      detail: (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {day.messages.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.role === "assistant" ? "flex-start" : "flex-end" }}>
              <div
                style={{
                  maxWidth: "82%",
                  padding: "9px 12px",
                  borderRadius: 12,
                  fontSize: 12,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  background: m.role === "assistant" ? "var(--panel2)" : "var(--accent-soft)",
                  color: "var(--text)",
                  border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
      ),
    };
  });

  return <ArchiveHubClient predictions={predictionRows} dailyReports={dailyRows} chats={chatRows} />;
}
