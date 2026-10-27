// 둥지 능동적 알림 — "물어봐야만 답하는" 골구에서 "먼저 말 거는" 골구로 가는
// 첫 단계. 텔레그램 chat id를 연결한 사용자에 한해, 종목 판정(lib/holding-
// assessment.ts)이 어제보다 나빠졌으면 코드가 그 사실과 근거를 그대로 문장으로
// 만들어 보낸다 — 여기서도 LLM은 쓰지 않는다(숫자/판정은 이미 코드가 정했고,
// 알릴지 말지도 규칙이라 AI의 해석이 끼어들 자리가 없다).
//
// 트리거(이미 Vercel Hobby 크론 12개가 꽉 차 있어 새 크론을 못 만든다 —
// app/api/cron/intraday-monitor가 장중 매 정시 호출될 때 같이 돈다):
//   1) 상태가 전날 마지막 기록보다 나빠짐(STATE_RANK 상승)
//   2) 그 종목의 판정 기록이 오늘 하루뿐인데(막 샀거나 처음 진단됨) 상태가 이미 축소검토 이상
// 하루 중 같은 악화를 반복 알리지 않게 PortfolioAlertLog(userId+code+date 유일)로
// 막되, 같은 날 더 나빠지면(toState가 바뀌면) 다시 보낸다.

import { prisma } from "@/lib/prisma";
import { todayISO } from "@/lib/dates";
import { getHoldings } from "@/lib/portfolio";
import { getAssessmentReport, type AssessmentReport } from "@/lib/holding-assessment-store";
import { sendTelegramMessage } from "@/lib/telegram-send";
import { saveAssistantBroadcast } from "@/lib/chat-history";
import { STATE_RANK, type AssessmentState } from "@/lib/holding-assessment";
import { decideAlert, deepLossLine, formatAlertMessage, formatStockAlert, pickReasons, type AlertKind, type ImprovedHolding } from "@/lib/holding-alert-format";
import { fetchMarketIndexMap, gatherHoldingContext } from "@/lib/holding-context-store";
import { buildScenarios } from "@/lib/holding-context";
import {
  ANALYSIS_VERSION,
  buildPortfolioSnapshot,
  kstLabel,
  serializePayload,
  summaryKeyboard,
  type AlertRecordPayload,
  type DataQualityItem,
} from "@/lib/holding-alert-detail";
import { computeBudgetStatus, computeMonthOverview } from "@/lib/budget-engine";
import { computeSpendingTrend, getRecurringExpenseCandidates } from "@/lib/spending-insights";

// 주간 디지스트의 "예산·소비" 구간 — 사용자 요청(2026-10-21) 5번("반복되는
// 과소비 패턴 지적", "불필요한 고정 지출 후보 발굴", "목표 저축액에 부족한
// 금액 계산")을 여기 모았다. 전부 LLM 없이 코드가 계산한 숫자/목록 그대로
// 문장으로만 조립한다(이 파일 전체의 원칙과 동일).
async function buildBudgetSection(userId: string): Promise<string[]> {
  const [statuses, overview, trend, recurring] = await Promise.all([
    computeBudgetStatus(userId),
    computeMonthOverview(userId),
    computeSpendingTrend(userId),
    getRecurringExpenseCandidates(userId),
  ]);
  const lines: string[] = [];

  if (statuses.length > 0) {
    lines.push("카테고리 예산:");
    for (const s of statuses) {
      lines.push(`- ${s.category}: ${s.pctUsed.toFixed(0)}% 사용(₩${Math.round(s.spent).toLocaleString()}/₩${s.limit.toLocaleString()})${s.willExceed ? " ⚠️ 월말 초과 예상" : ""}`);
    }
  }

  if (overview.expense > 0) {
    lines.push(
      `이번 달 수입 ₩${Math.round(overview.income).toLocaleString()} · 지출 ₩${Math.round(overview.expense).toLocaleString()}(월말 예상 ₩${Math.round(overview.projectedExpense).toLocaleString()}) · 예상 저축 ₩${Math.round(overview.projectedSavings).toLocaleString()}`
    );
    if (overview.feasible !== null) {
      lines.push(
        overview.feasible
          ? `목표 월 투자금 ₩${Math.round(overview.requiredMonthlyContribution).toLocaleString()} — 이번 달 저축으로 충족 가능`
          : `⚠️ 목표 월 투자금 ₩${Math.round(overview.requiredMonthlyContribution).toLocaleString()}에 ₩${Math.round(overview.requiredMonthlyContribution - overview.projectedSavings).toLocaleString()} 부족할 것으로 예상`
      );
    }
  }

  if (trend.length > 0) {
    lines.push("과소비 패턴(지난달 같은 기간 대비):", ...trend.slice(0, 3).map((t) => `- ${t.category}: ₩${Math.round(t.thisMonth).toLocaleString()} (지난달 ₩${Math.round(t.lastMonth).toLocaleString()} 대비 +${t.diffPct!.toFixed(0)}%)`));
  }

  if (recurring.length > 0) {
    lines.push(
      "정기·구독 지출 후보(최근 60일):",
      ...recurring.slice(0, 5).map((r) => `- ${r.category}${r.memo ? ` · ${r.memo}` : ""}: ₩${Math.round(r.amount).toLocaleString()} (최근 ${r.lastDate}, ${r.occurrences}건)`)
    );
  }

  return lines;
}

export type AlertRunSummary = { usersChecked: number; messagesSent: number };

// module ⑨ "주간 자산 진단" — 매주 금요일 장마감 브리핑(app/api/cron/daily-
// briefing)에 얹어서 돈다(새 크론 못 만드는 건 위 설명과 같은 이유). 순자산
// 변화는 FinancialSnapshot(둥지 방문 시 하루 1행 upsert)에 기록이 있을 때만
// — 일주일간 둥지를 안 열었으면 억지로 추정하지 않고 "데이터 없음"이라 한다.
export async function sendWeeklyPortfolioDigest(): Promise<AlertRunSummary> {
  const users = await prisma.user.findMany({ where: { telegramChatId: { not: null } }, select: { id: true, telegramChatId: true } });
  let usersChecked = 0;
  let messagesSent = 0;

  for (const user of users) {
    if (!user.telegramChatId) continue;
    const holdings = await getHoldings(user.id);
    usersChecked++;

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weekAgoISO = sevenDaysAgo.toISOString().slice(0, 10);

      const [latestSnap, pastSnap] = await Promise.all([
        prisma.financialSnapshot.findFirst({ where: { userId: user.id }, orderBy: { date: "desc" } }),
        prisma.financialSnapshot.findFirst({ where: { userId: user.id, date: { lte: weekAgoISO } }, orderBy: { date: "desc" } }),
      ]);

      const date = latestSnap?.date ?? todayISO();
      const lines = [`📅 주간 자산 진단 (${date})`];
      if (latestSnap && pastSnap) {
        const diff = latestSnap.netWorth - pastSnap.netWorth;
        const diffPct = pastSnap.netWorth !== 0 ? (diff / Math.abs(pastSnap.netWorth)) * 100 : null;
        lines.push(
          `순자산 **${Math.round(latestSnap.netWorth).toLocaleString()}원** (1주일 전 대비 **${diff >= 0 ? "+" : ""}${Math.round(diff).toLocaleString()}원**${diffPct !== null ? ` / ${diff >= 0 ? "+" : ""}${diffPct.toFixed(1)}%` : ""})`
        );
      } else {
        lines.push("순자산 변화: 1주일 전 기록이 없어 비교 못 함(둥지를 방문해야 그날 스냅샷이 남아).");
      }

      // 종목 판정은 보유 종목이 있을 때만 — 없는 사람에게 "유지 0, 관찰
      // 0..."을 보여주는 건 의미가 없다(2026-10-21: 예전엔 보유 종목 없는
      // 사용자는 이 리포트 자체를 통째로 못 받았는데, 지출/예산만 쓰는
      // 사람도 주간 디지스트를 받아야 해서 게이트를 분리했다).
      if (holdings.length > 0) {
        const report = await getAssessmentReport(user.id);
        const byState = { 유지: 0, 관찰: 0, 축소검토: 0, 정밀점검: 0 };
        for (const a of report.assessments) byState[a.state]++;
        lines.push(`종목 판정: 유지 ${byState.유지} · 관찰 ${byState.관찰} · 축소검토 ${byState.축소검토} · 정밀점검 ${byState.정밀점검}`);

        const risky = report.assessments.filter((a) => a.state === "축소검토" || a.state === "정밀점검").slice(0, 3);
        if (risky.length > 0) {
          lines.push("주의가 필요한 종목:", ...risky.map((a) => `- ${a.name}: ${a.state} (${a.stateNote})`));
        }
        if (report.flags.length > 0) lines.push("포트폴리오 경고:", ...report.flags.map((f) => `- ${f.text}`));
      }

      const budgetLines = await buildBudgetSection(user.id);
      if (budgetLines.length > 0) lines.push("", "💰 예산·소비", ...budgetLines);

      // 보고할 내용이 아무것도 없으면(보유 종목도, 지출 기록도, 예산도
      // 없는 완전히 새 계정) 빈 메시지를 보내지 않는다.
      if (lines.length <= 1) continue;

      const text = lines.join("\n");
      const sent = await sendTelegramMessage(user.telegramChatId, text);
      if (sent) {
        messagesSent++;
        await saveAssistantBroadcast(user.id, date, text);
      }
    } catch (e) {
      console.error("[weekly-digest] failed for user", user.id, e);
    }
  }

  return { usersChecked, messagesSent };
}

export type PlannedAlert = {
  code: string;
  state: AssessmentState;
  name: string;
  kind: AlertKind;
  text: string;
  previousState: AssessmentState | null;
  previousScore: number | null;
  changedReasons: string[];
};

// 어제(바로 전 기록일)와 비교해 오늘 실제로 나빠진 종목만 고른다. 예전엔
// lastChange("마지막으로 상태가 달랐던 날")와 비교해서, 한 번 악화되면 같은
// 등급이 유지돼도 매일 다시 알림이 갔다(2026-10-27 수정, decideAlert 주석).
async function planAlerts(userId: string, report: AssessmentReport): Promise<{ alerts: PlannedAlert[]; improved: ImprovedHolding[] }> {
  const logs = await prisma.portfolioAlertLog.findMany({ where: { userId, date: report.date } });
  const alertedToday = new Map(logs.map((l) => [l.code, l.toState as AssessmentState]));

  const alerts: PlannedAlert[] = [];
  const improved: ImprovedHolding[] = [];

  for (const a of report.assessments) {
    const prev = report.history[a.code]?.previousDay ?? null;
    if (prev && STATE_RANK[a.state] < STATE_RANK[prev.state]) improved.push({ name: a.name, from: prev.state, to: a.state });

    const kind = decideAlert({ state: a.state, previousState: prev?.state ?? null, alreadyAlertedState: alertedToday.get(a.code) ?? null });
    if (!kind) continue;
    alerts.push({
      code: a.code,
      state: a.state,
      name: a.name,
      kind,
      text: formatStockAlert({ kind, assessment: a, price: report.prices[a.code], previousState: prev?.state ?? null, changedReasons: prev?.reasons ?? [] }),
      previousState: prev?.state ?? null,
      previousScore: prev?.totalScore ?? null,
      changedReasons: prev?.reasons ?? [],
    });
  }
  return { alerts, improved };
}

// 알림 보낼 종목마다 "보낸 그 시점" 스냅샷을 남긴다(HoldingAlertRecord) — 텔레그램
// 상세 버튼은 이 기록으로만 그린다(lib/holding-alert-detail.ts). 뉴스·공시·업종처럼
// 무거운 조회는 여기서, 알림 대상 종목에만 한다. 한 종목이 실패해도(기록 저장 실패
// 등) 그 종목 버튼만 빠지고 알림 자체는 나간다.
type RecordShared = {
  deadlineAt: number;
  portfolioDataAsOf: string;
  indices: Awaited<ReturnType<typeof fetchMarketIndexMap>>;
  portfolio: ReturnType<typeof buildPortfolioSnapshot>;
};

export async function recordShared(report: AssessmentReport): Promise<RecordShared> {
  return {
    deadlineAt: Date.now() + 20_000, // 크론 60초 한도 안에서 다른 작업 몫을 남긴다
    portfolioDataAsOf: new Date().toISOString(),
    indices: await fetchMarketIndexMap(),
    portfolio: buildPortfolioSnapshot({
      asOf: report.asOf,
      session: report.session,
      totalValuation: report.totalValuation,
      assessments: report.assessments,
      prices: report.prices,
      flags: report.flags.map((f) => f.text),
    }),
  };
}

// HoldingAlertRecord 한 행에 들어갈 값(저장은 안 함) — 미리보기 스크립트도 이걸 쓴다.
export async function buildAlertRecordData(userId: string, report: AssessmentReport, alert: PlannedAlert, shared: RecordShared) {
  const { deadlineAt, portfolioDataAsOf, indices, portfolio } = shared;
  const a = report.assessments.find((x) => x.code === alert.code);
  if (!a) return null;
  const price = report.prices[a.code] ?? null;
  const detail = report.details[a.code] ?? null;
  const ctx = await gatherHoldingContext({
    userId,
    code: a.code,
    name: a.name,
    stockPct: price?.changePct ?? null,
    market: price?.market,
    indices,
    deadlineAt,
  }).catch(() => null);

  const dataQuality: DataQualityItem[] = [
    { item: "시세", ok: !!price?.live, note: price ? (price.live ? "실시간" : "일봉 대체") : "없음" },
    { item: "수급", ok: (detail?.flow.days ?? 0) > 0, note: detail?.flow.asOfDate ? `${detail.flow.asOfDate}까지` : "" },
    { item: "뉴스", ok: ctx?.news.ok ?? false, note: "" },
    { item: "공시", ok: ctx?.filings.ok ?? false, note: "" },
    { item: "지수", ok: indices.ok, note: "" },
    { item: "업종", ok: !!ctx?.move.sector, note: !ctx?.theme ? "분류 없음" : ctx.move.sector ? `${kstLabel(ctx.move.sector.asOf)} 집계` : "비교 종목 부족" },
    { item: "재무", ok: (detail?.financials.length ?? 0) > 0, note: "연간만" },
  ];
  const payload: AlertRecordPayload = {
    technical: { price, chart: detail?.chart ?? null },
    volume: detail?.volume ?? null,
    flow: detail?.flow ?? null,
    financial: { years: detail?.financials ?? [], signalNote: a.signals.find((s) => s.key === "financial")?.note ?? null },
    sector: { theme: ctx?.theme ?? null, move: ctx?.move ?? null },
    news: { news: ctx?.news ?? { ok: false, items: [] }, filings: ctx?.filings ?? { ok: false, items: [], total: 0 } },
    trigger: { reasons: pickReasons(a, alert.changedReasons), signals: a.signals, stateNote: a.stateNote, deepLoss: deepLossLine(a) },
    action: { scenarios: buildScenarios(detail?.chart ?? null, detail?.volume ?? null), thesis: ctx?.thesis ?? null },
    portfolio,
    dataQuality,
  };

  return {
    userId,
    stockCode: a.code,
    stockName: a.name,
    alertType: alert.kind,
    marketDataAsOf: price?.asOf ?? null,
    portfolioDataAsOf,
    previousSeverity: alert.previousState,
    currentSeverity: a.state,
    previousRiskScore: alert.previousScore,
    currentRiskScore: a.totalScore,
    currentPrice: a.currentPrice,
    previousClose: price?.prevClose ?? null,
    dailyChangePct: price?.changePct ?? null,
    avgBuyPrice: a.avgBuyPrice,
    holdingQuantity: a.quantity,
    unrealizedReturnPct: a.changePct,
    portfolioWeight: a.weightPct,
    analysisVersion: ANALYSIS_VERSION,
    ...serializePayload(payload),
  };
}

async function createAlertRecords(userId: string, report: AssessmentReport, alerts: PlannedAlert[]): Promise<{ id: string; name: string }[]> {
  const shared = await recordShared(report);
  const created = await Promise.all(
    alerts.map(async (alert) => {
      try {
        const data = await buildAlertRecordData(userId, report, alert, shared);
        if (!data) return null;
        const row = await prisma.holdingAlertRecord.create({ data, select: { id: true } });
        return { id: row.id, name: data.stockName };
      } catch (e) {
        console.error("[portfolio-alerts] alert record save failed", alert.code, e);
        return null;
      }
    })
  );
  return created.filter((x): x is { id: string; name: string } => x !== null);
}



export async function sendPortfolioAlerts(): Promise<AlertRunSummary> {
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, telegramChatId: true },
  });

  let usersChecked = 0;
  let messagesSent = 0;

  for (const user of users) {
    if (!user.telegramChatId) continue;
    const holdings = await getHoldings(user.id);
    if (holdings.length === 0) continue;
    usersChecked++;

    try {
      const report = await getAssessmentReport(user.id);
      const { alerts, improved } = await planAlerts(user.id, report);
      if (alerts.length === 0) continue;

      const records = await createAlertRecords(user.id, report, alerts).catch((e) => {
        console.error("[portfolio-alerts] alert records failed", e);
        return [] as { id: string; name: string }[];
      });
      const message = formatAlertMessage({
        asOf: report.asOf,
        session: report.session,
        analyzedCount: report.assessments.length,
        stockBlocks: alerts.map((x) => ({ name: x.name, kind: x.kind, text: x.text })),
        improved,
        hasButtons: records.length > 0,
      });
      const sent = await sendTelegramMessage(user.telegramChatId, message, records.length > 0 ? { replyMarkup: summaryKeyboard(records) } : {});
      if (records.length > 0) {
        await prisma.holdingAlertRecord
          .updateMany({ where: { id: { in: records.map((r) => r.id) }, userId: user.id }, data: { deliveryStatus: sent ? "sent" : "failed" } })
          .catch(() => {});
      }
      if (!sent) continue; // 중복 방지 기록을 안 남겨야 다음 정시에 다시 시도한다

      messagesSent++;
      await Promise.all(
        alerts.map((x) =>
          prisma.portfolioAlertLog.upsert({
            where: { userId_code_date: { userId: user.id, code: x.code, date: report.date } },
            create: { userId: user.id, code: x.code, date: report.date, toState: x.state },
            update: { toState: x.state },
          })
        )
      );
      await saveAssistantBroadcast(user.id, report.date, message);
    } catch (e) {
      console.error("[portfolio-alerts] failed for user", user.id, e);
    }
  }

  return { usersChecked, messagesSent };
}
