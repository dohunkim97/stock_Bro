// CatalystValidator 모듈 (볼린저 Phase 2, 사용자 스펙 2단계 "재료와 뉴스
// 확인") — "기사에 언급됐다는 이유만으로 직접 수혜주로 판단하지 않는다"는
// 요구 그대로, 종목명이 제목에 직접 등장하는지/설명에만 나오는지로 직접·
// 간접 수혜를 가르고, 기사 발표일로 신선도를 확인한다. "시장 기대감"(직접
// 언급도 없이 테마로만 묶이는 경우)까지 세 단계로 구분한다.
//
// 뉴스 본문의 호재/악재 방향 판정은 lib/sentiment.ts(이미 있는 키워드 기반
// POSITIVE_WORDS/NEGATIVE_WORDS)를 그대로 재사용한다 — 같은 판정을 두 곳에서
// 다르게 구현하면 나중에 서로 다른 말을 하게 된다는 lib/candidate-detail.ts의
// 기존 원칙을 따름. LLM은 쓰지 않는다(코드는 계산, AI는 설명 — 이 모듈은
// "계산" 담당).

import type { NewsItem } from "@/lib/naver-news";
import { sentimentVerdict } from "@/lib/sentiment";

export type CatalystDirectness = "직접 수혜" | "간접 수혜" | "시장 기대감" | "확인 안됨" | "데이터 부족";

export type CatalystCheck = {
  stockName: string;
  checkedAt: string; // ISO — "기사 발표 날짜"를 여기 기준으로 신선도 계산
  freshnessDays: number | null; // 가장 최근 관련 기사가 며칠 전인지, 기사 없으면 null
  topItems: NewsItem[]; // 신선도 판단에 쓴 상위 기사(최대 5건)
  directness: CatalystDirectness;
  sentiment: "긍정" | "중립" | "부정" | null;
  valid: boolean; // 매수 조건 체크리스트에서 "재료 유효"로 셀지 여부
  reasons: string[];
};

const RECENT_DAYS_FOR_VALID = 14; // 이 안에 든 기사만 "여전히 유효한 재료"로 본다(스펙 4단계 "재료가 여전히 유효함")
const MAX_ITEMS = 5;

function daysBetween(fromISO: string, toISO: string): number | null {
  const from = new Date(fromISO).getTime();
  const to = new Date(toISO).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

// news: 이미 호출부가 lib/naver-news.ts의 fetchNews(stockName, ..., "date")로
// 가져온 결과(최신순) — 이 모듈은 네트워크를 직접 부르지 않는다(순수 함수로
// 유지해 테스트하기 쉽게).
export function evaluateCatalyst(stockName: string, news: NewsItem[], nowISO: string): CatalystCheck {
  const withDate = news.filter((n) => n.pubDate).slice(0, MAX_ITEMS);

  if (withDate.length === 0) {
    return {
      stockName,
      checkedAt: nowISO,
      freshnessDays: null,
      topItems: [],
      directness: "데이터 부족",
      sentiment: null,
      valid: false,
      reasons: ["관련 뉴스를 찾지 못함"],
    };
  }

  const freshnessDays = daysBetween(withDate[0].pubDate, nowISO);
  const mentionsInTitle = withDate.filter((n) => n.title.includes(stockName));
  const directness: CatalystDirectness =
    mentionsInTitle.length > 0 ? "직접 수혜" : withDate.some((n) => n.description.includes(stockName)) ? "간접 수혜" : "시장 기대감";

  const sentimentSource = withDate.map((n) => `${n.title} ${n.description}`).join(" ");
  const sentiment: "긍정" | "중립" | "부정" | null =
    sentimentVerdict(sentimentSource) === true ? "긍정" : sentimentVerdict(sentimentSource) === false ? "부정" : "중립";

  const reasons: string[] = [];
  const isFresh = freshnessDays !== null && freshnessDays <= RECENT_DAYS_FOR_VALID;
  if (isFresh) reasons.push(`최근 ${freshnessDays}일 전 관련 기사 확인(${withDate[0].source || "출처 불명"})`);
  else reasons.push(freshnessDays !== null ? `가장 최근 기사가 ${freshnessDays}일 전 — 재료 신선도 낮음` : "기사 발표일 확인 불가");
  reasons.push(directness === "직접 수혜" ? "종목명이 기사 제목에 직접 등장" : directness === "간접 수혜" ? "기사 본문에만 종목명 등장(간접 수혜 가능성)" : "종목명 직접 언급 없이 테마로만 연결됨");

  return {
    stockName,
    checkedAt: nowISO,
    freshnessDays,
    topItems: withDate,
    directness,
    sentiment,
    valid: isFresh && directness !== "시장 기대감",
    reasons,
  };
}
