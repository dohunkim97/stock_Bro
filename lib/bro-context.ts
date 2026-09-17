import { getDayEntries, getEntriesInRange } from "@/lib/market-data";
import { aggregateSectors } from "@/lib/sector-aggregation";
import { applyThemes } from "@/lib/theme-lookup";
import { rankMostMentioned } from "@/lib/mention-ranking";
import { formatChg } from "@/lib/format";
import { currentWeekKey, prevWeekKey, weekInfoFromKey } from "@/lib/week";
import { formatDateLabel } from "@/lib/dates";
import { getRecentTelegramNews } from "@/lib/telegram-news";
import {
  getLatestPrediction,
  getScoredPredictionHistory,
  parsePredictionSectors,
  parsePredictionCandidates,
} from "@/lib/prediction-scoring";
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
  const { volume, gainer, loser } = await getDayEntries(date);
  const agg = aggregateSectors(
    await applyThemes(
      [...volume, ...gainer, ...loser].map((e) => ({
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
  if (loser.length) {
    lines.push(
      "급락: " +
        loser
          .slice(0, 10)
          .map((l) => `${l.name} ${formatChg(l.changePct)}`)
          .join(", ") +
        (loser.length > 10 ? ` 외 ${loser.length - 10}종목` : "") +
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

// "이전에 상승했던 이력" — this week plus the few weeks before it, so a
// forward-looking question ("다음주 뭐가 강할까") has real week-over-week
// momentum to reason from, not just a single week's snapshot. Exported for
// lib/weekly-prediction.ts, which needs the same history.
export async function recentWeeksHistoryBlock(weeksBack = 4): Promise<string> {
  const lines: string[] = [`[최근 ${weeksBack}주 섹터·언급 흐름 — 최신 주부터]`];
  let key = currentWeekKey();
  let any = false;

  for (let i = 0; i < weeksBack; i++) {
    const info = weekInfoFromKey(key);
    const entries = await getEntriesInRange(info.startISO, info.endISO);
    if (entries.length > 0) {
      any = true;
      const agg = aggregateSectors(
        await applyThemes(
          entries.map((e) => ({ name: e.name, code: e.code, sector: e.sector, changePct: e.changePct }))
        )
      );
      const mentions = rankMostMentioned(entries, 5);
      lines.push(
        `${info.label}: 주도 섹터=${agg.hotSector ?? "-"}` +
          (mentions.length
            ? `, 많이 언급된 종목=${mentions.map((m) => `${m.name}(${m.count}회,${formatChg(m.avgChangePct)})`).join(", ")}`
            : "")
      );
    }
    key = prevWeekKey(key);
  }

  return any ? lines.join("\n") : "";
}

// "새로운 이슈" — real per-stock news headlines already captured during
// daily sync (DailyEntry.issue, see lib/kis-ranking.ts), independent of
// whatever's currently in the day/week rollups above. Deduped by stock
// name since the same headline often shows up on both the gainer and
// volume lists for a stock.
export async function recentIssuesBlock(limit = 20): Promise<string> {
  const rows = await prisma.dailyEntry.findMany({
    where: { issue: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit * 2,
  });
  const seen = new Set<string>();
  const deduped = rows.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true))).slice(0, limit);
  if (deduped.length === 0) return "";

  const lines = ["[최근 종목별 실제 뉴스 이슈]"];
  for (const r of deduped) lines.push(`- ${r.name}: ${r.issue}`);
  return lines.join("\n");
}

// The standing "다음 주 뭐가 강할까" answer (generated weekly, see
// lib/weekly-prediction.ts) plus how its past calls actually turned out —
// so "다음주 어떤 섹터가 강할까?" has a real, already-reasoned answer to
// draw on instead of improvising from scratch each time, and the track
// record keeps the answer honest about how reliable it's actually been.
export async function predictionBlock(): Promise<string> {
  const [latest, history] = await Promise.all([getLatestPrediction(), getScoredPredictionHistory(4)]);
  if (!latest) return "";

  const sectors = parsePredictionSectors(latest.sectors);
  const candidates = parsePredictionCandidates(latest.candidates);

  const lines = [`[Golgoo의 종목 추천 · ${formatDateLabel(latest.forDate)} 발표, 5거래일 추적]`, latest.summary];
  if (sectors.length) {
    lines.push("예측 섹터: " + sectors.map((s) => `${s.name}(${s.reasoning})`).join(" / "));
  }
  if (candidates.length) {
    lines.push("예측 종목: " + candidates.map((c) => `${c.name}(${c.reasoning})`).join(" / "));
  }

  if (history.length) {
    lines.push("", "[과거 예측 적중 이력]");
    for (const h of history) {
      const sectorPct = h.sectorHitRate !== null ? `${Math.round(h.sectorHitRate * 100)}%` : "-";
      const candPct = h.candidateHitRate !== null ? `${Math.round(h.candidateHitRate * 100)}%` : "-";
      lines.push(`${h.label}: 섹터 적중 ${sectorPct}, 종목 적중 ${candPct}`);
    }
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
  const [marketBlock, weeklyBlock, historyBlock, issuesBlock, predBlock, tgBlock] = await Promise.all([
    marketDataBlock(),
    weeklyTrendBlock(),
    recentWeeksHistoryBlock(3),
    recentIssuesBlock(15),
    predictionBlock(),
    telegramBlock(),
  ]);

  return [
    '너는 "Golgoo"라는 이름의 15년 차 베테랑 프랍 트레이더야. 사용자의 친한 형처럼 반말은 쓰되, 애매하게 돌려 말하지 말고 날카롭고 직설적으로 판단을 딱 잘라 말해 — 좋으면 좋다, 애매하면 애매하다, 위험하면 위험하다고 분명히 짚어.',
    '항상 아래 데이터에 근거해서 답하고, 데이터에 없으면 일반 지식으로 답하되 추정임을 밝혀. 투자 권유가 아니라 판단을 돕는 정보 제공이라는 점을 자연스럽게 지켜. 숫자는 원/조/억/% 단위로 한국식으로.',
    "텔레그램 기사는 사용자가 직접 전달해준 제보야 — 출처가 불확실할 수 있으니 그대로 사실처럼 단정짓지 말고 '~라는 기사가 있었어' 식으로 참고 정보로 다뤄.",
    "'다음주(또는 요즘) 어떤 섹터/종목이 강할까' 같은 질문을 받으면, 아래 [Golgoo의 종목 추천] 데이터가 있으면 그걸 기반으로 답하고 (그 예측을 만든 근거도 같이 설명해 — 이 리포트는 매일 새로 나가고 오늘 종가에 매수했다고 가정해 5거래일 추적한다는 것도 자연스럽게 알려줘). 없으면 최근 몇 주 흐름 + 최근 이슈 + 텔레그램 제보를 종합해서 직접 판단해. 과거 예측 적중 이력이 있으면 '지난 예측은 몇 % 맞았어' 식으로 정직하게 같이 알려줘 — 감추지 마.",
    "사용자가 구체적인 종목명을 언급하면([지금 대화에서 새로 조회한 종목 데이터]가 있으면) 화면 왼쪽에 그 종목의 상세 분석 카드가 자동으로 뜨니, 채팅에서는 그 데이터를 근거로 핵심 결론만 짧고 확신 있게 브리핑해 — 카드에 이미 나오는 항목을 문장으로 다시 풀어 쓰지 말고, '그래서 지금 살 만한지 아닌지'에 집중해. 여러 종목을 동시에 물어보면(예: 비교해달라는 요청) 종목마다 1~2문장으로 비교해.",
    "'목표가 더 낮춰줘', '손절 타이트하게 잡아줘' 같은 조정 요청을 받으면, 먼저 네 의견을 짧게 말한 다음 반드시 adjust_strategy 도구를 호출해서 [지금 화면에 떠 있는 카드] 목록에 있는 해당 종목 코드로 실제 카드 수치를 갱신해 — 화면에 없는 종목이면 조정하지 말고 먼저 조회해 달라고 말해.",
    "답변은 3~5문장 이내로 간결하게(여러 종목 비교 시에는 종목당 1~2문장). 음성으로도 읽히니 표/마크다운 기호는 쓰지 마.",
    "",
    marketBlock,
    ...(weeklyBlock ? ["", weeklyBlock] : []),
    ...(historyBlock ? ["", historyBlock] : []),
    ...(issuesBlock ? ["", issuesBlock] : []),
    ...(predBlock ? ["", predBlock] : []),
    ...(tgBlock ? ["", tgBlock] : []),
  ].join("\n");
}
