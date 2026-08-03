import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { marketDataBlock, weeklyTrendBlock } from "@/lib/bro-context";
import { getTelegramNewsSince } from "@/lib/telegram-news";
import { fetchKisLiveSnapshot, type KisRankRow } from "@/lib/kis-ranking";
import { fetchKisNewsForCodes, type KisNewsItem } from "@/lib/kis-news";
import { formatChg } from "@/lib/format";

export type BriefingSlot = "morning" | "midday" | "close";
export const BRIEFING_SLOTS: BriefingSlot[] = ["morning", "midday", "close"];
export const SLOT_TITLE: Record<BriefingSlot, string> = {
  morning: "모닝 브리핑",
  midday: "중간 브리핑",
  close: "장마감 브리핑",
};

const SLOT_INSTRUCTION: Record<BriefingSlot, string> = {
  morning:
    "지금은 장 시작 전 아침이야. 전일 마감 이후 들어온 텔레그램 제보를 중심으로, 오늘 장이 열리면 주목할 만한 포인트를 정리해줘.",
  midday:
    "지금은 장중 중간 시점이야. 실시간 랭킹과 한투 종합 시황/공시, 오늘 모닝 브리핑 이후 들어온 텔레그램 제보를 종합해서 그 사이 뭐가 바뀌었는지 정리해줘.",
  close:
    "지금은 장마감 이후야. 전일 마감부터 오늘 마감까지 하루 전체 흐름 — 실시간 랭킹, 한투 종합 시황/공시, 그 사이 들어온 텔레그램 제보까지 종합해서 오늘 하루를 정리해줘.",
};

const SYSTEM_PROMPT_BASE = [
  "너는 한국 주식시장을 하루 세 번(모닝/중간/장마감) 정리하는 애널리스트야.",
  "아래 데이터만 근거로 판단해. 데이터에 없는 건 추측하지 마.",
  "'한투(KIS) 종합 시황/공시'는 실제 뉴스 통신사(연합뉴스, 이데일리 등)가 작성한 정식 기사 제목이야 — 근거로 그대로 인용해도 돼. 반면 '텔레그램으로 전달받은 기사'는 사용자가 직접 전달해준 제보라 출처 검증이 안 됐으니, 사실처럼 단정짓지 말고 '~라는 제보가 있었어' 식으로 다뤄.",
  "투자 권유가 아니라 판단을 돕는 분석이라는 점을 유지해.",
  "sectorNote와 candidates는 한눈에 훑어볼 수 있게 짧고 구조화된 항목으로 써 — 긴 문단으로 풀어쓰지 마. 각 항목의 reason/note는 한 문장, 길어도 두 문장 이내로.",
  "다른 설명 없이 아래 JSON 형식으로만 답해:",
  '{"summary": "이번 브리핑의 핵심을 3-4문장으로 — 왜 이런 흐름인지 근거 포함", ' +
    '"sectorNote": {"theme": "지금 가장 주목되는 섹터·테마명 (예: 전기·전자, 로봇 테마)", "note": "왜 강한지/약한지 한 문장, 길어도 두 문장"}, ' +
    '"candidates": [{"name": "종목명 또는 테마명", "reason": "관찰 근거 한 문장, 길어도 두 문장"}] (배열, 2~3개, 확정적 추천이 아니라 관찰 포인트로)}',
];

type SectorNoteJson = { theme?: string; note: string };
type CandidateItem = { name?: string; reason: string };
type BriefingJson = { summary: string; sectorNote?: SectorNoteJson; candidates?: CandidateItem[] };

function parseBriefing(text: string): BriefingJson | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;

    let sectorNote: SectorNoteJson | undefined;
    if (parsed.sectorNote && typeof parsed.sectorNote === "object" && typeof parsed.sectorNote.note === "string") {
      sectorNote = {
        theme: typeof parsed.sectorNote.theme === "string" ? parsed.sectorNote.theme : undefined,
        note: parsed.sectorNote.note,
      };
    }

    let candidates: CandidateItem[] | undefined;
    if (Array.isArray(parsed.candidates)) {
      candidates = parsed.candidates
        .filter((c: unknown): c is CandidateItem => !!c && typeof c === "object" && typeof (c as CandidateItem).reason === "string")
        .map((c: CandidateItem) => ({ name: typeof c.name === "string" ? c.name : undefined, reason: c.reason }));
    }

    return { summary: parsed.summary, sectorNote, candidates };
  } catch {
    return null;
  }
}

// midday wants "since this morning's briefing"; morning and close both want
// "since the last close" — close is a full-day rollup back to yesterday's
// close, and this morning hasn't happened yet the moment morning itself runs,
// so they resolve to the same anchor: the most recent "close" slot.
async function windowStart(slot: BriefingSlot, date: string, now: Date): Promise<Date> {
  if (slot === "midday") {
    const morning = await prisma.marketBriefing.findFirst({
      where: { date, slot: "morning" },
      orderBy: { createdAt: "desc" },
    });
    if (morning) return morning.createdAt;
  } else {
    const prevClose = await prisma.marketBriefing.findFirst({
      where: { slot: "close" },
      orderBy: { createdAt: "desc" },
    });
    if (prevClose) return prevClose.createdAt;
  }
  // First-ever run for a slot with no prior anchor to work from.
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

const LIVE_TOP_N = 8;
const NEWS_CODE_COUNT = 8;

function formatLiveSnapshotBlock(snapshot: { gainer: KisRankRow[]; volume: KisRankRow[] } | null): string {
  if (!snapshot) return "";
  const lines = ["[지금 이 순간 실시간 랭킹 (한투 KIS)]"];
  if (snapshot.gainer.length) {
    lines.push(
      "실시간 급상승: " +
        snapshot.gainer
          .slice(0, LIVE_TOP_N)
          .map((r) => `${r.name} ${formatChg(r.changePct)}`)
          .join(", ") +
        "."
    );
  }
  if (snapshot.volume.length) {
    lines.push(
      "실시간 거래량 상위: " +
        snapshot.volume
          .slice(0, LIVE_TOP_N)
          .map((r) => `${r.name}(${r.code}) ${formatChg(r.changePct)}`)
          .join(", ") +
        "."
    );
  }
  return lines.join("\n");
}

// The day's most notable movers right now — used to scope which stocks get
// a KIS news-title lookup (that endpoint is only useful per-code, see
// lib/kis-news.ts), not to display directly.
function pickTopCodes(snapshot: { gainer: KisRankRow[]; volume: KisRankRow[] } | null, n: number): string[] {
  if (!snapshot) return [];
  const byCode = new Map<string, KisRankRow>();
  for (const r of [...snapshot.gainer, ...snapshot.volume]) {
    if (!byCode.has(r.code)) byCode.set(r.code, r);
  }
  return [...byCode.values()]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, n)
    .map((r) => r.code);
}

function formatKisNewsBlock(items: KisNewsItem[]): string {
  if (items.length === 0) return "";
  const lines = ["[한투(KIS) 종합 시황/공시 — 오늘 주요 변동 종목 관련]"];
  for (const it of items) {
    const time = it.time.length === 6 ? `${it.time.slice(0, 2)}:${it.time.slice(2, 4)}` : it.time;
    lines.push(`- (${time}${it.source ? `, ${it.source}` : ""}${it.stockName ? `, ${it.stockName}` : ""}) ${it.title}`);
  }
  return lines.join("\n");
}

function formatTelegramBlock(items: Awaited<ReturnType<typeof getTelegramNewsSince>>): string {
  if (items.length === 0) return "[이 구간에 전달된 텔레그램 기사 없음]";
  const lines = ["[이 브리핑 구간에 전달된 텔레그램 기사]"];
  for (const it of items) {
    const d = it.createdAt;
    const label = `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
    const firstLine = it.text.split("\n")[0].trim();
    lines.push(`- (${label}${it.sourceName ? `, ${it.sourceName}` : ""}) ${firstLine}`);
  }
  return lines.join("\n");
}

export async function generateBriefing(slot: BriefingSlot, date: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const now = new Date();
  const since = await windowStart(slot, date, now);
  const wantsLiveData = slot === "midday" || slot === "close";

  const [marketBlock, weeklyBlock, tgItems, liveSnapshot] = await Promise.all([
    marketDataBlock(),
    weeklyTrendBlock(),
    getTelegramNewsSince(since, 30),
    wantsLiveData ? fetchKisLiveSnapshot(LIVE_TOP_N) : Promise.resolve(null),
  ]);

  // KIS's news-title endpoint is only meaningful scoped to a specific code
  // (verified empirically — blank returns generic newswire, not market
  // commentary), so this runs after the snapshot, not in the Promise.all
  // above, since it depends on which codes the snapshot surfaced.
  const kisNews = wantsLiveData ? await fetchKisNewsForCodes(pickTopCodes(liveSnapshot, NEWS_CODE_COUNT)) : [];

  const userPrompt = [
    marketBlock,
    weeklyBlock,
    formatLiveSnapshotBlock(liveSnapshot),
    formatKisNewsBlock(kisNews),
    formatTelegramBlock(tgItems),
  ]
    .filter(Boolean)
    .join("\n\n");
  const systemPrompt = [...SYSTEM_PROMPT_BASE, SLOT_INSTRUCTION[slot]].join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    // Sonnet 5 runs adaptive thinking by default, and its token spend counts
    // against max_tokens same as visible output — a real request here spent
    // 1002 tokens thinking and got cut off mid-JSON with the old 1500 cap.
    // This task is straightforward synthesis of the data already handed to
    // it, not multi-step reasoning, so low effort curbs that without
    // disabling thinking outright (which has its own failure modes). Kept
    // max_tokens well above what low-effort thinking + this JSON shape needs.
    max_tokens: 2500,
    output_config: { effort: "low" },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = parseBriefing(text);
  if (!parsed) return;

  // sectorNote/candidates are stored as JSON text in what are still plain
  // String columns — parsed back out in components/market/ai-briefing.tsx,
  // which also falls back to treating older rows as plain text if JSON.parse
  // fails (they predate this structured format).
  const sectorNote = parsed.sectorNote ? JSON.stringify(parsed.sectorNote) : undefined;
  const candidates = parsed.candidates ? JSON.stringify(parsed.candidates) : undefined;

  await prisma.marketBriefing.upsert({
    where: { date_slot: { date, slot } },
    create: { date, slot, summary: parsed.summary, sectorNote, candidates },
    update: { summary: parsed.summary, sectorNote, candidates },
  });
}

export async function getBriefing(date: string, slot: BriefingSlot) {
  return prisma.marketBriefing.findUnique({ where: { date_slot: { date, slot } } });
}

export async function getBriefingSlotsForDate(date: string) {
  return prisma.marketBriefing.findMany({ where: { date }, orderBy: { createdAt: "asc" } });
}

// sectorNote/candidates are JSON-encoded text in the DB (see generateBriefing)
// but older rows predate that and stored plain prose — these parse either,
// falling back to treating the raw string as a single legacy block.
export function parseSectorNote(raw: string | null): SectorNoteJson | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.note === "string") return { theme: typeof p.theme === "string" ? p.theme : undefined, note: p.note };
  } catch {
    // legacy plain-text row
  }
  return { note: raw };
}

export function parseCandidates(raw: string | null): CandidateItem[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) {
      return p.filter((c): c is CandidateItem => !!c && typeof c.reason === "string");
    }
  } catch {
    // legacy plain-text row
  }
  return [{ reason: raw }];
}
