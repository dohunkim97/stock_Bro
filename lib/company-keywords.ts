// A handful of short "이 회사가 실제로 뭘 파는가" keywords per stock, shown
// next to 부채비율 on 종목상세. StockMaster.sector/industry are broad KRX
// classifications ("전기전자"), not product-level — this reads real recent
// news headlines instead and has an LLM pull out concrete product/export/
// business keywords, since that's the only place that information actually
// shows up in this app's data.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { fetchNews } from "@/lib/naver-news";

const REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // 30일 — 회사 주력 사업은 자주 안 바뀌니 뉴스/LLM 호출을 아낀다
const NEWS_COUNT = 6;
const MAX_KEYWORDS = 5;

const SYSTEM_PROMPT = [
  "너는 한국 기업 뉴스 기사 제목·요약만 보고 그 회사가 실제로 파는 제품·서비스·사업을 뽑는 도구야.",
  "결과는 2~6글자 안팎의 짧은 한글 명사구 키워드로, 최대 5개. 예: '노광기 부품', '2차전지 소재', '반도체 후공정 장비', '대미 수출', '방산 부품', 'OLED 소재'.",
  "'전기전자', '화학'처럼 넓은 업종명은 쓰지 마 — 이미 다른 데이터로 갖고 있어.",
  "기사에 실제로 언급된 내용만 근거로 삼고, 추측하지 마. 근거가 부족하면 개수를 줄이거나 빈 배열을 반환해도 돼.",
  '다른 설명 없이 JSON 배열만 답해. 형식: ["키워드1", "키워드2"]. 뽑을 게 없으면 [].',
].join("\n");

function parseKeywords(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function extractKeywords(stockName: string): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const news = await fetchNews(stockName, NEWS_COUNT);
  if (news.length === 0) return [];

  const text = news.map((n) => `${n.title} - ${n.description}`).join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 300,
      output_config: { effort: "low" },
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
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, MAX_KEYWORDS);
  } catch {
    return [];
  }
}

// Best-effort — a slow/failed extraction shouldn't block the stock detail
// page. Caches even an empty result (a stock with no recent news genuinely
// has nothing to extract) so a thin-news stock doesn't retry the LLM call on
// every single page view within the refresh window.
export async function getCompanyKeywords(code: string, stockName: string): Promise<string[]> {
  try {
    const cached = await prisma.companyKeywords.findUnique({ where: { code } });
    if (cached && Date.now() - cached.updatedAt.getTime() < REFRESH_MS) {
      return parseKeywords(cached.keywords);
    }

    const keywords = await extractKeywords(stockName);
    await prisma.companyKeywords.upsert({
      where: { code },
      create: { code, keywords: JSON.stringify(keywords) },
      update: { keywords: JSON.stringify(keywords) },
    });
    return keywords;
  } catch {
    return [];
  }
}
