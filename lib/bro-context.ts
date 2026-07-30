import { getDayEntries, getEntriesInRange } from "@/lib/market-data";
import { aggregateSectors } from "@/lib/sector-aggregation";
import { applyThemes } from "@/lib/theme-lookup";
import { rankMostMentioned } from "@/lib/mention-ranking";
import { formatChg } from "@/lib/format";
import { currentWeekKey, weekInfoFromKey } from "@/lib/week";
import { getRecentTelegramNews } from "@/lib/telegram-news";
import { prisma } from "@/lib/prisma";

// Exported so lib/market-briefing.ts (the daily cron-generated AI summary)
// can build the exact same market/telegram context Golgoo's chat sees,
// without duplicating the query + formatting logic.
export async function marketDataBlock(): Promise<string> {
  const latest = await prisma.dailyEntry.findFirst({
    orderBy: { date: "desc" },
  });
  if (!latest) {
    return "[오늘의 시장 데이터]\n아직 입력된 거래량 상위·급상승 종목 데이터가 없어. 사용자가 Market 화면에서 종목을 입력하면 그 데이터로 답해줘.";
  }

  const date = latest.date;
  const { volume, gainer } = await getDayEntries(date);
  const agg = aggregateSectors(
    await applyThemes(
      [...volume, ...gainer].map((e) => ({
        name: e.name,
        code: e.code,
        sector: e.sector,
        changePct: e.changePct,
      }))
    )
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

export async function weeklyTrendBlock(): Promise<string> {
  const weekInfo = weekInfoFromKey(currentWeekKey());
  const weekEntries = await getEntriesInRange(weekInfo.startISO, weekInfo.endISO);
  if (weekEntries.length === 0) return "";

  const agg = aggregateSectors(
    await applyThemes(
      weekEntries.map((e) => ({ name: e.name, code: e.code, sector: e.sector, changePct: e.changePct }))
    )
  );
  const mentions = rankMostMentioned(weekEntries, 8);

  const lines = [`[이번 주 흐름 · ${weekInfo.label}]`];
  if (agg.hasData) {
    lines.push(`이번 주 주도 섹터=${agg.hotSector} (랭킹 등장 ${agg.totalCount}건 중 ${agg.hotSectorCount}건).`);
  }
  if (mentions.length) {
    lines.push(
      "가장 많이 언급된 종목: " +
        mentions
          .map((m) => `${m.name}(${m.count}회, 평균 ${formatChg(m.avgChangePct)})`)
          .join(", ") +
        "."
    );
  }
  return lines.join("\n");
}

export async function telegramBlock(): Promise<string> {
  const items = await getRecentTelegramNews(8);
  if (items.length === 0) return "";

  const lines = ["[텔레그램으로 전달받은 최근 기사]"];
  for (const it of items) {
    const d = it.createdAt;
    const dateLabel = `${d.getMonth() + 1}.${d.getDate()}`;
    const firstLine = it.text.split("\n")[0].trim();
    lines.push(`- (${dateLabel}${it.sourceName ? `, ${it.sourceName}` : ""}) ${firstLine}`);
  }
  return lines.join("\n");
}

export async function buildSystemPrompt(): Promise<string> {
  const [marketBlock, weeklyBlock, tgBlock] = await Promise.all([
    marketDataBlock(),
    weeklyTrendBlock(),
    telegramBlock(),
  ]);

  return [
    '너는 "Golgoo"라는 이름의 개인 투자 AI 조력자야. 사용자의 친한 형/친구처럼 편하게 반말로, 짧고 명확하게 대답해. 이모지는 아주 가끔만.',
    '항상 아래 데이터에 근거해서 답하고, 데이터에 없으면 일반 지식으로 답하되 추정임을 밝혀. 투자 권유가 아니라 판단을 돕는 정보 제공이라는 점을 자연스럽게 지켜. 숫자는 원/조/억/% 단위로 한국식으로.',
    "텔레그램 기사는 사용자가 직접 전달해준 제보야 — 출처가 불확실할 수 있으니 그대로 사실처럼 단정짓지 말고 '~라는 기사가 있었어' 식으로 참고 정보로 다뤄.",
    "답변은 3~5문장 이내로 간결하게. 음성으로도 읽히니 표/마크다운 기호는 쓰지 마.",
    "",
    marketBlock,
    ...(weeklyBlock ? ["", weeklyBlock] : []),
    ...(tgBlock ? ["", tgBlock] : []),
  ].join("\n");
}
