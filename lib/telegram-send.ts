// 봇이 "먼저 말 거는" 쪽 — 받는 쪽(app/api/telegram/webhook)과 반대 방향.
// 같은 TELEGRAM_BOT_TOKEN을 그대로 쓴다. 실패해도(네트워크, 차단 등) 호출한
// 쪽(알림/연결 발견)이 멈추지 않게 boolean만 돌려주고 에러는 삼킨다.
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
