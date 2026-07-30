import Anthropic from "@anthropic-ai/sdk";

export type ThemeExtraction = { name: string; theme: string };

const SYSTEM_PROMPT = [
  "너는 한국 주식 뉴스 제목에서 종목명과 구체적인 투자 테마를 추출하는 도구야.",
  "테마는 업종보다 훨씬 세분화된 키워드여야 해. 예: 태양광, 해저케이블, 변압기, 2차전지, 로봇·휴머노이드, 방산, 조선기자재, AI반도체 소재, 원자력, 우주항공, 바이오시밀러.",
  "'건설', '전기전자', '화학'처럼 넓은 업종명은 테마로 쓰지 마 — 그건 이미 다른 데이터로 갖고 있어.",
  "제목에 특정 회사 이름이 명확히 나오고, 그 회사와 관련된 구체적 테마가 뚜렷하게 드러날 때만 추출해. 단순 실적/소송/공시 뉴스처럼 특정 테마가 없으면 그 종목은 결과에서 빼.",
  '다른 설명 없이 JSON 배열만 답해. 형식: [{"name": "종목명", "theme": "테마"}]. 추출할 게 하나도 없으면 [].',
].join("\n");

export async function extractThemes(text: string): Promise<ThemeExtraction[]> {
  if (!process.env.ANTHROPIC_API_KEY || !text.trim()) return [];

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (p): p is ThemeExtraction =>
          !!p &&
          typeof p === "object" &&
          typeof (p as ThemeExtraction).name === "string" &&
          typeof (p as ThemeExtraction).theme === "string" &&
          (p as ThemeExtraction).name.trim().length > 0 &&
          (p as ThemeExtraction).theme.trim().length > 0
      )
      .map((p) => ({ name: p.name.trim(), theme: p.theme.trim() }));
  } catch {
    return [];
  }
}
