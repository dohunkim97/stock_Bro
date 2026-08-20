import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/bro-context";
import { saveChatTurn } from "@/lib/chat-history";
import { todayISO } from "@/lib/dates";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] };

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 설정되어 있지 않아요. .env 파일을 확인해 주세요." },
      { status: 500 }
    );
  }

  const client = new Anthropic();
  const system = await buildSystemPrompt();

  let lastErr: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 600,
        system,
        messages,
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      // The client always sends its full running history with exactly one
      // new user turn appended — save just that turn, not the whole array,
      // so a saved conversation isn't duplicated on every subsequent call.
      // Awaited (not fire-and-forget): a serverless function can be frozen
      // right after the response is sent, which would silently drop an
      // un-awaited write.
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser) await saveChatTurn(todayISO(), lastUser.content, text);

      return NextResponse.json({ reply: text });
    } catch (e) {
      lastErr = e;
      const overloaded =
        e instanceof Anthropic.APIError &&
        (e.status === 429 || e.status === 529 || e.status === 500);
      if (overloaded && i < 2) {
        await new Promise((r) => setTimeout(r, 900 * (i + 1)));
        continue;
      }
      break;
    }
  }

  const overloaded =
    lastErr instanceof Anthropic.APIError &&
    (lastErr.status === 429 || lastErr.status === 529);
  return NextResponse.json(
    {
      error: overloaded
        ? "지금 서버가 잠깐 몰렸나 봐. 몇 초 뒤에 다시 물어봐 줄래?"
        : "미안, 지금 응답을 못 가져왔어. 잠깐 뒤에 다시 시도해줘.",
    },
    { status: 502 }
  );
}
