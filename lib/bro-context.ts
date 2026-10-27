import { getDayEntries, getEntriesInRange } from "@/lib/market-data";
import { aggregateSectors } from "@/lib/sector-aggregation";
import { applyThemes } from "@/lib/theme-lookup";
import { rankMostMentioned } from "@/lib/mention-ranking";
import { formatChg } from "@/lib/format";
import { currentWeekKey, prevWeekKey, weekInfoFromKey } from "@/lib/week";
import { formatDateLabel, kstDateParts } from "@/lib/dates";
import { getRecentTelegramNews } from "@/lib/telegram-news";
import { getLatestPrediction, parsePredictionSectors, parsePredictionCandidates } from "@/lib/prediction-scoring";
import { loadOutcomeRows, outcomeOneLiner } from "@/lib/prediction-learning";
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
  const [latest, outcomeRows] = await Promise.all([getLatestPrediction(), loadOutcomeRows()]);
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

  // 옛 "종목 적중률"(5일 종가>0 기준)은 목표/손절 결과와 어긋나 헷갈려서
  // (+2.48%인데 손절 같은 표기) 결과 DB 기준 요약으로 대체 — 목표/손절 중
  // 먼저 닿은 쪽, 실현수익, 판정 가능 건수를 코드가 집계한 값 그대로.
  const track = outcomeOneLiner(outcomeRows);
  if (track) lines.push("", "[과거 예측 성과 — 5거래일 결과 확정 기준]", track);

  return lines.join("\n");
}

export async function telegramBlock(): Promise<string> {
  const items = await getRecentTelegramNews(8);
  if (items.length === 0) return "";

  const lines = ["[텔레그램으로 전달받은 최근 기사]"];
  for (const it of items) {
    const { month, day } = kstDateParts(it.createdAt);
    const dateLabel = `${month}.${day}`;
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
    "사용자가 구체적인 종목명을 언급하면([지금 대화에서 새로 조회한 종목 데이터]가 있으면) 그 데이터를 근거로 답해 — 현재가는 꼭 숫자로 말하고, 시황·거래량·차트·재료·수급·재무 중 중요한 것 위주로 핵심 결론('그래서 지금 살 만한지 아닌지')까지 짧고 확신 있게 브리핑해. (웹에서는 화면 왼쪽에 같은 데이터가 상세 카드로도 뜨니 전부 다시 풀어쓸 필요는 없지만, 텔레그램에서는 카드가 안 보여서 네 답이 사용자가 보는 유일한 정보야 — 아래 [참고]에 지금 채널이 뭔지 나와 있으면 그에 맞게 조절해.) 여러 종목을 동시에 물어보면(예: 비교해달라는 요청) 종목마다 1~2문장으로 비교해.",
    "'목표가 더 낮춰줘', '손절 타이트하게 잡아줘' 같은 조정 요청을 받으면, 먼저 네 의견을 짧게 말한 다음 반드시 adjust_strategy 도구를 호출해서 [지금 화면에 떠 있는 카드] 목록에 있는 해당 종목 코드로 실제 카드 수치를 갱신해 — 화면에 없는 종목이면 조정하지 말고 먼저 조회해 달라고 말해.",
    "사용자가 '~샀어', '~매수했어'처럼 실제 매수를 보고하면 record_holding_purchase 도구를 호출해서 둥지(내 보유 종목)에 기록해 — 수량과 가격 중 아무것도 못 들었으면 호출하지 말고 얼마에 몇 주 샀는지 먼저 물어봐. 이 도구가 실행되면 결과 메시지가 네 말을 대신하니 너는 그 전에 따로 '기록했어' 같은 말을 하지 않아도 돼. [내 둥지 현황]이 보이면 '내 포트폴리오 어때', '리포트 줘', '수익률 어때' 같은 질문에 그 숫자를 근거로 바로 답해.",
    "180일 주식 학습 플래닛은 자동으로 아무것도 안 보내고 진도도 자동으로 안 올라가 — 사용자가 말해야만 움직여. '학습 시작해줘'엔 set_learning_plan_state(start), '학습자료 줘'/'오늘 미션 줘'엔 material, '학습 완료'/'오늘 다 했어'처럼 그날 분량을 끝냈다고 하면 complete(이래야 다음 날로 넘어가), '학습 그만할래'엔 pause를 호출해. 사용자가 그날 공부/분석한 내용을 말해주면(예: '오늘 삼성전자 봤어, 반도체 업황 때문에 오를 것 같아') record_learning_journal을 호출해서 투자 연구 일지로 기록해 — 도구 실행 결과 메시지가 네 말을 대신해.",
    "[네이버 지식백과 검색 결과]가 있으면 '~가 뭐야' 식 용어 질문에 그 검색 결과를 근거로 쉽게 풀어서 설명해 — 네가 아는 지식으로 지어내지 말고. 검색 결과가 없거나 안 떴으면 평소처럼 네 지식으로 설명하되 추정이라는 티를 내.",
    "'~테마 추천해줘', '~관련주 뭐있어' 같은 질문엔 [테마 종목 검색 결과]가 있으면 그 종목들만(그날 랭킹에 없어도) 근거로 추천해 — 직접 보유(ETF 실보유)와 뉴스 기반 추정을 구분해서 말하고, 이 블록에 없는 종목을 테마주라고 지어내지 마. 이 블록이 안 떴으면 아직 그 테마로 분류된 종목이 DB에 없다는 뜻이니 솔직히 모른다고 말하고, 종목명을 알면 직접 말해달라고 해.",
    "답변은 3~5문장 이내로 간결하게(여러 종목 비교 시에는 종목당 1~2문장). 핵심 숫자·결론·종목명은 **이렇게** 두 개의 별표로 감싸서 강조해 — 화면과 텔레그램 둘 다에서 실제로 굵게 보여(음성으로 읽을 땐 별표만 빼고 읽어). 표는 쓰지 마(안 예쁘게 나와).",
    "",
    marketBlock,
    ...(weeklyBlock ? ["", weeklyBlock] : []),
    ...(historyBlock ? ["", historyBlock] : []),
    ...(issuesBlock ? ["", issuesBlock] : []),
    ...(predBlock ? ["", predBlock] : []),
    ...(tgBlock ? ["", tgBlock] : []),
  ].join("\n");
}
