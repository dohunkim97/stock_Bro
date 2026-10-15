// 네이버 검색(지식백과) API — https://developers.naver.com/docs/serviceapi/search/encyclopedia/encyclopedia.md
// lib/naver-news.ts와 같은 Open API 앱 자격증명(NAVER_CLIENT_ID/SECRET)을
// 쓰는 자매 상품. 기업분석/학습 중 "PER이 뭐야?" 같은 용어 질문이 오면
// 모델이 혼자 추측해 설명하지 않고, 실제 네이버 지식백과 검색 결과를 먼저
// 가져와 그걸 근거로 설명하게 한다(lib/golgoo-chat.ts의 buildTermLookupBlock).

const ENCYC_URL = "https://openapi.naver.com/v1/search/encyc.json";
const PER_REQUEST_TIMEOUT_MS = 6000;

export type EncycItem = {
  title: string; // 표제어
  description: string; // 요약 설명(일부 발췌)
  link: string;
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

export async function searchEncyclopedia(query: string, display = 2): Promise<EncycItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret || !query.trim()) return [];

  const url = new URL(ENCYC_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));

  try {
    const res = await fetch(url.toString(), {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];
    return items.map((it: Record<string, unknown>) => ({
      title: stripHtml(String(it.title ?? "")),
      description: stripHtml(String(it.description ?? "")),
      link: String(it.link ?? ""),
    }));
  } catch {
    return [];
  }
}
