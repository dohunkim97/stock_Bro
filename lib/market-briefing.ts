import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { marketDataBlock, weeklyTrendBlock, telegramBlock } from "@/lib/bro-context";

const SYSTEM_PROMPT = [
  "너는 한국 주식시장을 매일 장마감 후 정리하는 애널리스트야.",
  "아래 데이터만 근거로 오늘 시장을 판단해. 데이터에 없는 건 추측하지 말고, 텔레그램 기사는 출처가 불확실한 제보로만 취급해.",
  "투자 권유가 아니라 판단을 돕는 분석이라는 점을 유지해. 다른 설명 없이 아래 JSON 형식으로만 답해:",
  '{"summary": "오늘 시장 전체를 3-4문장으로 요약 — 왜 이런 흐름이었는지 근거 포함", "sectorNote": "오늘 가장 주목된 섹터가 왜 강했는지/약했는지 2-3문장", "candidates": "내일 이후 관심 가질 만한 종목·섹터 2-3개와 근거를 짧게, 확정적 추천이 아니라 관찰 포인트로"}',
].join("\n");

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

export async function generateDailyBriefing(date: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const [marketBlock, weeklyBlock, tgBlock] = await Promise.all([
    marketDataBlock(),
    weeklyTrendBlock(),
    telegramBlock(),
  ]);

  const userPrompt = [marketBlock, weeklyBlock, tgBlock].filter(Boolean).join("\n\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = parseBriefing(text);
  if (!parsed) return;

  await prisma.marketBriefing.upsert({
    where: { date },
    create: {
      date,
      summary: parsed.summary,
      sectorNote: parsed.sectorNote,
      candidates: parsed.candidates,
    },
    update: {
      summary: parsed.summary,
      sectorNote: parsed.sectorNote,
      candidates: parsed.candidates,
    },
  });
}

export async function getBriefing(date: string) {
  return prisma.marketBriefing.findUnique({ where: { date } });
}
