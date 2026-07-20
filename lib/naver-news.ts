// 네이버 검색(뉴스) API — https://developers.naver.com/docs/serviceapi/search/news/news.md
// Real headlines/links for a stock name search. No summarization/"why it
// moved" analysis — that still needs an LLM (Bro AI key isn't set up yet),
// so this is real linked news, not a fabricated explanation.

const NEWS_URL = "https://openapi.naver.com/v1/search/news.json";
const PER_REQUEST_TIMEOUT_MS = 6000;

export type NewsItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string; // ISO 8601
  source: string; // registrable domain, e.g. "yna.co.kr"
};

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function fetchNews(query: string, display = 8): Promise<NewsItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret || !query.trim()) return [];

  const url = new URL(NEWS_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "date");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];

    return items.map((it: Record<string, unknown>) => {
      const link = String(it.originallink || it.link || "");
      const parsedDate = new Date(String(it.pubDate ?? ""));
      return {
        title: stripHtml(String(it.title ?? "")),
        link,
        description: stripHtml(String(it.description ?? "")),
        pubDate: Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString(),
        source: domainOf(link),
      };
    });
  } catch {
    return [];
  }
}
