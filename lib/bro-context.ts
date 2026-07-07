import { getDayEntries } from "@/lib/market-data";
import { aggregateSectors } from "@/lib/sector-aggregation";
import { formatChg } from "@/lib/format";
import { prisma } from "@/lib/prisma";

async function marketDataBlock(): Promise<string> {
  const latest = await prisma.dailyEntry.findFirst({
    orderBy: { date: "desc" },
  });
  if (!latest) {
    return "[오늘의 시장 데이터]\n아직 입력된 거래량 상위·급상승 종목 데이터가 없어. 사용자가 Market 화면에서 종목을 입력하면 그 데이터로 답해줘.";
  }

  const date = latest.date;
  const { volume, gainer } = await getDayEntries(date);
  const agg = aggregateSectors(
    [...volume, ...gainer].map((e) => ({
      name: e.name,
      code: e.code,
      sector: e.sector,
      changePct: e.changePct,
    }))
  );

  // Only the top few of each list go into the prompt — up to 100 entries
  // per list would blow up the context for no benefit to a 3-5 sentence reply.
  const lines = [`[오늘의 시장 데이터 · ${date} KRX 장마감]`];
  if (volume.length) {
    lines.push(
      "거래량 상위: " +
        volume
          .slice(0, 10)
          .map((v) => `${v.name}(${v.code ?? "코드미상"}) ${v.price}원 ${formatChg(v.changePct)}`)
          .join(", ") +
        (volume.length > 10 ? ` 외 ${volume.length - 10}종목` : "") +
        "."
    );
  }
  if (gainer.length) {
    lines.push(
      "급상승: " +
        gainer
          .slice(0, 10)
          .map((g) => `${g.name} ${formatChg(g.changePct)}`)
          .join(", ") +
        (gainer.length > 10 ? ` 외 ${gainer.length - 10}종목` : "") +
        "."
    );
  }
  if (agg.hasData) {
    lines.push(
      `오늘의 주목 섹터=${agg.hotSector}(입력 ${agg.totalCount}종목 중 ${agg.hotSectorCount}종목). ` +
        `섹터 분포: ${agg.sectors.map((s) => `${s.name} ${s.pct}%`).join(", ")}.`
    );
  }
  return lines.join("\n");
}

const STOCK_DETAIL_BLOCK = [
  "[한미반도체(042700) 상세 — 종목 상세 화면에서 항상 표시되는 샘플 데이터]",
  "시총 14.4조(코스닥 3위), PER 62.3, PBR 12.1. 매출(억) 23년 1,590 → 24년 2,861 → 25E 5,500. " +
    "영업이익 311→785→1,870. 부채비율 31→28→25%. 매출비중 HBM 본더(TC본더) 65%, 비전플레이스먼트 20%, " +
    "기타장비 15%. 경쟁사 ASMPT/BESI/원익IPS. 리스크: 고객사 편중, 환율, 높은 밸류에이션.",
].join("\n");

export async function buildSystemPrompt(): Promise<string> {
  const marketBlock = await marketDataBlock();
  return [
    '너는 "Bro"라는 이름의 개인 투자 AI 조력자야. 사용자의 친한 형/친구처럼 편하게 반말로, 짧고 명확하게 대답해. 이모지는 아주 가끔만.',
    '항상 아래 데이터에 근거해서 답하고, 데이터에 없으면 일반 지식으로 답하되 추정임을 밝혀. 투자 권유가 아니라 판단을 돕는 정보 제공이라는 점을 자연스럽게 지켜. 숫자는 원/조/억/% 단위로 한국식으로.',
    "답변은 3~5문장 이내로 간결하게. 음성으로도 읽히니 표/마크다운 기호는 쓰지 마.",
    "",
    marketBlock,
    "",
    STOCK_DETAIL_BLOCK,
  ].join("\n");
}
