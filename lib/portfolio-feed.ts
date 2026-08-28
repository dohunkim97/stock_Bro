// 둥지의 "보유 종목 실시간 인텔리전스 피드" — 보유 종목 이름으로 네이버
// 뉴스를 검색하고(components/market/watchlist-news.tsx와 같은 방식), 최근
// 텔레그램 제보 중 보유 종목명이 언급된 것만 골라낸다. 두 소스 모두 각
// 아이템에 어떤 보유 종목과 관련된 것인지 태그를 붙여서, 클라이언트에서
// "전체 | 종목별 필터 칩"으로 바로 걸러 볼 수 있게 한다.

import { fetchNews, type NewsItem } from "@/lib/naver-news";
import { getRecentTelegramNews } from "@/lib/telegram-news";

export type FeedItem = NewsItem & { stockName: string; kind: "news" | "telegram" };

function toTitle(text: string): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

export async function getPortfolioFeed(holdingNames: string[]): Promise<FeedItem[]> {
  if (holdingNames.length === 0) return [];

  const uniqueNames = [...new Set(holdingNames)];

  const [newsPerStock, telegramItems] = await Promise.all([
    Promise.all(uniqueNames.map((name) => fetchNews(name, 5))),
    getRecentTelegramNews(30),
  ]);

  const news: FeedItem[] = [];
  uniqueNames.forEach((name, i) => {
    for (const item of newsPerStock[i]) news.push({ ...item, stockName: name, kind: "news" });
  });

  // 텔레그램 제보는 종목별 검색 API가 없어서, 최근 제보 텍스트 안에 보유
  // 종목명이 등장하는지로 직접 매칭 — 한 기사에 여러 보유 종목이 같이
  // 언급되면 그만큼 각 종목의 피드에 중복으로 걸린다(의도된 동작).
  const telegram: FeedItem[] = [];
  for (const t of telegramItems) {
    for (const name of uniqueNames) {
      if (t.text.includes(name)) {
        telegram.push({
          title: toTitle(t.text),
          link: t.link ?? "",
          description: t.text,
          pubDate: t.createdAt.toISOString(),
          source: t.sourceName ? `텔레그램 · ${t.sourceName}` : "텔레그램 제보",
          stockName: name,
          kind: "telegram",
        });
      }
    }
  }

  return [...news, ...telegram].sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}
