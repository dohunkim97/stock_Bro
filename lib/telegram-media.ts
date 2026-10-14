// 텔레그램이 보내는 미디어(음성 메모·사진)를 글자/구조화된 데이터로 바꾸는
// 곳 — 파일 자체는 텔레그램 서버에 있으니 getFile로 경로를 받아 내려받은
// 뒤, 음성은 OpenAI Whisper로 텍스트화하고 사진(영수증)은 Claude Vision으로
// 금액/카테고리를 추출한다. 둘 다 외부 키가 없으면(OPENAI_API_KEY 등) 조용히
// null을 돌려주고, 호출부(lib/telegram-chat.ts)가 "텍스트로 말해줄래?" 같은
// 안내로 대체한다 — 이 봇의 다른 기능은 그 키 없이도 그대로 동작해야 해서.

import Anthropic from "@anthropic-ai/sdk";
import { EXPENSE_CATEGORIES } from "@/lib/finance-constants";

export async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; filePath: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const metaRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const meta = await metaRes.json();
    if (!meta.ok || typeof meta.result?.file_path !== "string") return null;
    const filePath: string = meta.result.file_path;
    const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!fileRes.ok) return null;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    return { buffer: buf, filePath };
  } catch {
    return null;
  }
}

// 텔레그램 보이스 메모(ogg/opus) -> 텍스트. OPENAI_API_KEY가 없으면 null —
// 이 프로젝트의 다른 LLM 호출은 전부 Anthropic이고, Claude Messages API는
// 오디오 입력을 아직 받지 않아서 음성 전사만 별도 서비스(Whisper)를 쓴다.
export async function transcribeVoice(buffer: Buffer): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: "audio/ogg" }), "voice.ogg");
    form.append("model", "whisper-1");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.text === "string" && data.text.trim() ? data.text.trim() : null;
  } catch {
    return null;
  }
}

export type ReceiptExtraction = { amount: number; category: string; memo: string | null };

// 영수증 사진 -> 지출 정보. Claude Vision(이미지 입력)은 이 프로젝트가 이미
// 쓰는 Anthropic SDK 그대로라 키를 새로 받을 필요가 없다.
export async function extractReceiptFromImage(buffer: Buffer, mimeType = "image/jpeg"): Promise<ReceiptExtraction | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 300,
      system:
        "영수증 사진에서 총 결제금액과 지출 성격을 추출해. 다른 설명 없이 JSON만 답해: " +
        `{"amount": 총액(숫자, 원 단위, 못 읽으면 null), "category": 다음 중 하나(${EXPENSE_CATEGORIES.join("/")}), "memo": "가게 이름이나 품목 짧게(모르면 null)"}`,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg", data: buffer.toString("base64") } },
            { type: "text", text: "이 영수증(또는 결제 화면)에서 지출 정보를 추출해줘." },
          ],
        },
      ],
    });
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const amount = typeof parsed.amount === "number" && parsed.amount > 0 ? Math.round(parsed.amount) : null;
    if (amount === null) return null;
    const category = typeof parsed.category === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(parsed.category)
      ? parsed.category
      : "기타";
    const memo = typeof parsed.memo === "string" && parsed.memo.trim() ? parsed.memo.trim() : null;
    return { amount, category, memo };
  } catch {
    return null;
  }
}
