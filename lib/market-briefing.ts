import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { marketDataBlock, weeklyTrendBlock } from "@/lib/bro-context";
import { getTelegramNewsSince } from "@/lib/telegram-news";

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
    "지금은 장중 중간 시점이야. 오늘 모닝 브리핑 이후 새로 들어온 텔레그램 제보를 중심으로 그 사이 뭐가 바뀌었는지 정리해줘.",
  close:
    "지금은 장마감 이후야. 전일 마감부터 오늘 마감까지 하루 전체 흐름과 그 사이 들어온 텔레그램 제보를 종합해서 오늘 하루를 정리해줘.",
};

const SYSTEM_PROMPT_BASE = [
  "너는 한국 주식시장을 하루 세 번(모닝/중간/장마감) 정리하는 애널리스트야.",
  "아래 데이터만 근거로 판단해. 데이터에 없는 건 추측하지 말고, 텔레그램 기사는 출처가 불확실한 제보로만 취급해.",
  "투자 권유가 아니라 판단을 돕는 분석이라는 점을 유지해. 다른 설명 없이 아래 JSON 형식으로만 답해:",
  '{"summary": "이번 브리핑의 핵심을 3-4문장으로 — 왜 이런 흐름인지 근거 포함", "sectorNote": "지금 가장 주목되는 섹터·테마가 왜 강한지/약한지 2-3문장", "candidates": "앞으로 관심 가질 만한 종목·섹터 2-3개와 근거, 확정적 추천이 아니라 관찰 포인트로"}',
];

type BriefingJson = { summary: string; sectorNote?: string; candidates?: string };

function parseBriefing(text: string): BriefingJson | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;
    return parsed;
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

  const [marketBlock, weeklyBlock, tgItems] = await Promise.all([
    marketDataBlock(),
    weeklyTrendBlock(),
    getTelegramNewsSince(since, 30),
  ]);

  const userPrompt = [marketBlock, weeklyBlock, formatTelegramBlock(tgItems)].filter(Boolean).join("\n\n");
  const systemPrompt = [...SYSTEM_PROMPT_BASE, SLOT_INSTRUCTION[slot]].join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = parseBriefing(text);
  if (!parsed) return;

  await prisma.marketBriefing.upsert({
    where: { date_slot: { date, slot } },
    create: { date, slot, summary: parsed.summary, sectorNote: parsed.sectorNote, candidates: parsed.candidates },
    update: { summary: parsed.summary, sectorNote: parsed.sectorNote, candidates: parsed.candidates },
  });
}

export async function getBriefing(date: string, slot: BriefingSlot) {
  return prisma.marketBriefing.findUnique({ where: { date_slot: { date, slot } } });
}

export async function getBriefingSlotsForDate(date: string) {
  return prisma.marketBriefing.findMany({ where: { date }, orderBy: { createdAt: "asc" } });
}
