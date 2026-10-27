// 봇이 "먼저 말 거는" 쪽 — 받는 쪽(app/api/telegram/webhook)과 반대 방향.
// 같은 TELEGRAM_BOT_TOKEN을 그대로 쓴다. 실패해도(네트워크, 차단 등) 호출한
// 쪽(알림/연결 발견)이 멈추지 않게 boolean만 돌려주고 에러는 삼킨다.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "**굵게**" 는 이 코드베이스 전체가 쓰는 공용 강조 표기(components/ui/
// rich-text.tsx의 renderBold와 같은 규칙 — market-briefing.ts·weekly-
// prediction.ts가 이미 이 마커로 요약문을 만들어왔다) — 텔레그램에서도
// 실제로 굵게 보이게 HTML <b> 태그로 바꾼다. 마크다운 대신 HTML을 쓰는
// 이유: 텔레그램 MarkdownV2는 '.', '-', '(' 같은 흔한 문장부호까지 전부
// 이스케이프해야 해서 숫자·%·원화 기호가 많은 금융 텍스트와 상성이
// 나쁘고, 하나라도 빠뜨리면 메시지 전체가 전송 실패한다 — HTML은
// 이스케이프 대상이 '&','<','>' 세 글자뿐이라 훨씬 안전하다.
function toTelegramHtml(text: string): string {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return `<b>${escapeHtml(part.slice(2, -2))}</b>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

// 텔레그램은 한 메시지에 4096자까지만 받고, 넘으면 통째로 실패한다. HTML 태그·
// 이스케이프(&amp; 등)로 길이가 늘어나는 걸 감안해 원문 기준 여유 있게 자른다.
// 줄 단위로만 자르므로 한 줄 안에 있는 **굵게** 표시는 쪼개지지 않는다.
const TELEGRAM_SAFE_LENGTH = 3500;

export function splitForTelegram(text: string, limit = TELEGRAM_SAFE_LENGTH): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    // 한 줄 자체가 한도보다 길면(거의 없지만) 글자 단위로 자른다.
    const pieces = line.length > limit ? (line.match(new RegExp(`[\\s\\S]{1,${limit}}`, "g")) ?? [line]) : [line];
    for (const piece of pieces) {
      const next = current ? `${current}\n${piece}` : piece;
      if (next.length > limit && current) {
        chunks.push(current);
        current = piece;
      } else {
        current = next;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    for (const chunk of splitForTelegram(text)) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: toTelegramHtml(chunk), parse_mode: "HTML" }),
      });
      if (!res.ok) return false;
    }
    return true;
  } catch {
    return false;
  }
}
