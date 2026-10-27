// "로봇 테마 추천해줘" 같은 질문에 답하려고 StockTheme 테이블 전체를 훑는다.
// lib/theme-lookup.ts의 applyThemes/onlyThemed는 "오늘 랭킹(거래량·등락률
// 상위)에 이미 올라온 종목에 테마 라벨만 덧씌우는" 용도라 이 질문엔 안
// 맞는다 — 오늘 거래가 뜸한 테마주는 애초에 랭킹에 없어서 걸러진다
// (2026-10-21 사용자 확인: "로봇 테마 추천해줘"를 물어보면 골구가 답을
// 못 함 — 원인은 golgoo-chat.ts가 StockTheme을 아예 조회하지 않고
// 그날 랭킹 top-N만 보고 있었던 것. StockTheme 데이터 자체(ETF 실보유
// 종목 포함)는 정상적으로 쌓이고 있었다).

import { prisma } from "@/lib/prisma";
import { fetchKisQuote } from "@/lib/kis-quote";
import { resolveStock } from "@/lib/market-data";

export type ThemeStockHit = {
  name: string;
  code: string | null;
  theme: string;
  source: string | null;
  price: number | null;
  changePct: number | null;
  volume: number | null;
};

const SEPARATORS = /[·,/\s]+/;

// 테마 라벨("로봇·휴머노이드")이 사용자 질문 텍스트에 토큰 단위로
// 등장하는지 본다 — "로봇 테마 추천해줘"도, "휴머노이드 관련주 뭐있어"도
// 둘 다 맞아야 하니까 라벨을 쪼개서 어느 한쪽만 들어있어도 매칭한다.
function themeMatchesQuery(queryText: string, themeLabel: string): boolean {
  if (queryText.includes(themeLabel)) return true;
  return themeLabel.split(SEPARATORS).some((tok) => tok.length >= 2 && queryText.includes(tok));
}

// 매칭된 종목이 너무 많으면(흔한 토큰이 여러 테마에 걸치는 경우) 의미가
// 없어서 상한을 둔다 — 그래도 limit보다 많이 찾았다는 사실 자체는
// 호출부가 알 수 있게 전체 매칭 수도 같이 돌려준다.
export async function findThemeStocks(queryText: string, limit = 15): Promise<{ hits: ThemeStockHit[]; totalMatched: number } | null> {
  const allThemes = await prisma.stockTheme.findMany();
  const matched = allThemes.filter((t) => themeMatchesQuery(queryText, t.theme));
  if (matched.length === 0) return null;

  const capped = matched.slice(0, limit);
  const hits = await Promise.all(
    capped.map(async (t) => {
      // resolveStock(lib/market-data.ts)은 정확히 일치하는 종목명이 없으면
      // contains 검색으로 느슨하게 대체한다(다른 용도엔 적합) — 여기선
      // "LG"로 찾다가 "LG에너지솔루션"이 걸려 완전히 다른 회사 시세를
      // 보여주는 사고가 실제로 났어서, 테마 조회에선 이름이 정확히 같을
      // 때만 그 결과를 받아들인다(모르면 "조회 실패"가 틀린 가격보다 낫다).
      const resolved = t.code ? null : await resolveStock(t.name).catch(() => null);
      const code = t.code ?? (resolved && resolved.name === t.name ? resolved.code : null);
      const quote = code ? await fetchKisQuote(code).catch(() => null) : null;
      return {
        name: t.name,
        code,
        theme: t.theme,
        source: t.source,
        price: quote?.price ?? null,
        changePct: quote?.changePct ?? null,
        volume: quote?.volume ?? null,
      };
    })
  );
  return { hits, totalMatched: matched.length };
}

// ETF 실제 구성종목(펀드가 실제로 담은 종목, source가 "ETF 구성종목(...)")
// 과 뉴스 제목에서 LLM이 추출한 것(추정)을 나눠서 보여준다 — GPT 제안의
// "직접/간접/기대감 분류·신뢰도"를 새 스키마 없이, 이미 있는 source 값으로
// 대신한다. 펀드가 실제로 산 종목이 뉴스 추정보다 신뢰도가 높다는 원칙은
// lib/kis-etf-holdings.ts에 이미 있던 것 그대로.
export function themeStockBlock(result: { hits: ThemeStockHit[]; totalMatched: number }): string {
  const { hits, totalMatched } = result;
  const direct = hits.filter((h) => h.source?.startsWith("ETF 구성종목"));
  const inferred = hits.filter((h) => !h.source?.startsWith("ETF 구성종목"));
  const themes = [...new Set(hits.map((h) => h.theme))];

  const line = (h: ThemeStockHit) =>
    `- ${h.name}${h.code ? `(${h.code})` : ""} [${h.theme}]: 현재가=${h.price ?? "조회 실패"}${
      h.changePct !== null ? ` 등락률=${h.changePct >= 0 ? "+" : ""}${h.changePct.toFixed(2)}%` : ""
    }${h.volume !== null ? ` 거래량=${h.volume.toLocaleString()}` : ""}`;

  const lines = [
    `\n\n[테마 종목 검색 결과 — "${themes.join("/")}" 관련, DB 전체 검색(오늘 거래량 랭킹에 없어도 포함)${totalMatched > hits.length ? `, 총 ${totalMatched}건 중 ${hits.length}건만 표시` : ""}]`,
  ];
  if (direct.length > 0) lines.push("직접 보유(테마 ETF 실제 구성종목 — 펀드가 실제로 담은 종목, 신뢰도 높음):", ...direct.map(line));
  if (inferred.length > 0) lines.push("뉴스 기반 추정(테마 ETF엔 없고 뉴스 제목에서 추출됨 — 참고용, 실제 사업 비중은 불확실):", ...inferred.map(line));
  lines.push(
    "이 종목들을 하나하나 현재가·등락률로 짚어주고, 거래량·등락률이 활발한 걸 우선으로 추천해. 이 목록에 없는 종목을 테마주라고 지어내지 말고, 직접 보유와 뉴스 기반 추정을 구분해서 말해."
  );
  return lines.join("\n");
}
