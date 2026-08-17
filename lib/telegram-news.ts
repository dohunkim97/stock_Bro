import { prisma } from "@/lib/prisma";
import { extractThemes, saveThemes } from "@/lib/theme-extraction";

const URL_RE = /https?:\/\/\S+/;

export type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number | string };
    text?: string;
    caption?: string;
    forward_from?: { first_name?: string; last_name?: string };
    forward_from_chat?: { title?: string };
    forward_sender_name?: string;
  };
};

function extractLink(text: string): string | undefined {
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[)\].,!?]+$/, "") : undefined;
}

function extractSourceName(message: NonNullable<TelegramUpdate["message"]>): string | undefined {
  if (message.forward_from_chat?.title) return message.forward_from_chat.title;
  if (message.forward_sender_name) return message.forward_sender_name;
  if (message.forward_from) {
    return [message.forward_from.first_name, message.forward_from.last_name]
      .filter(Boolean)
      .join(" ") || undefined;
  }
  return undefined;
}

// Only messages that carry an actual article link get stored — a plain-text
// note forwarded with no URL isn't something the news list (which links out
// to the original article) can render.
export async function saveTelegramMessage(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message) return;

  const text = (message.text ?? message.caption ?? "").trim();
  if (!text) return;

  const link = extractLink(text);
  if (!link) return;

  // create (not upsert) so a Telegram retry of an already-stored message is
  // distinguishable from a genuinely new one — theme extraction below is an
  // LLM call and should only ever run once per message.
  let created;
  try {
    created = await prisma.telegramNews.create({
      data: {
        chatId: String(message.chat.id),
        messageId: message.message_id,
        text,
        link,
        sourceName: extractSourceName(message),
      },
    });
  } catch {
    return;
  }

  try {
    const themes = await extractThemes(created.text);
    const source = created.text.split("\n")[0].slice(0, 200);
    await saveThemes(themes, source);
  } catch {
    // Theme extraction is best-effort — a failure here shouldn't undo the
    // fact that the article itself was already saved successfully above.
  }
}

export async function getRecentTelegramNews(limit = 10) {
  return prisma.telegramNews.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// Used by the briefing pipeline (lib/market-briefing.ts) to pull only what's
// new since the previous slot's cutoff, rather than an arbitrary "latest N".
export async function getTelegramNewsSince(since: Date, limit = 30) {
  return prisma.telegramNews.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
