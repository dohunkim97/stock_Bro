// 테마별 순매수/순매도 — "얼마나 활발히 거래되는가"(ThemeDailyFlow)와 다른 질문:
// "사는 쪽이 파는 쪽보다 우세한가". lib/kis-investor-trend.ts의 종목별 외국인+
// 기관 순매수를 태깅된 종목 전체에 대해 합산한다.

import { prisma } from "@/lib/prisma";
import { fetchInvestorTrend } from "@/lib/kis-investor-trend";
import { resolveStock } from "@/lib/market-data";

// Same concurrency/backoff convention as lib/theme-daily-flow.ts.
const CONCURRENCY = 6;
const BATCH_GAP_MS = 250;

async function resolveMissingCodes(): Promise<void> {
  const rows = await prisma.stockTheme.findMany({ where: { code: null } });
  for (const r of rows) {
    const stock = await resolveStock(r.name);
    if (stock?.code) {
      await prisma.stockTheme.update({ where: { name: r.name }, data: { code: stock.code } }).catch(() => {});
    }
  }
}

// fetchInvestorTrend returns the most recent `days` trading days in one call
// per stock (unlike ThemeDailyFlow's per-day quote lookup), so this is a
// single pass over the themed stock list, not one pass per day.
export async function syncThemeNetFlow(days: number): Promise<void> {
  await resolveMissingCodes();

  const themed = await prisma.stockTheme.findMany({ where: { code: { not: null } } });
  const byCode = new Map(themed.map((t) => [t.code!, t]));
  const targets = [...byCode.values()];
  if (targets.length === 0) return;

  const rows: {
    date: string;
    code: string;
    name: string;
    theme: string;
    foreignNet: number;
    institutionNet: number;
    individualNet: number;
  }[] = [];

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, BATCH_GAP_MS));
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (t) => {
        const trend = await fetchInvestorTrend(t.code!, days);
        for (const d of trend) {
          rows.push({
            date: d.date,
            code: t.code!,
            name: t.name,
            theme: t.theme,
            foreignNet: d.foreign,
            institutionNet: d.institution,
            individualNet: d.individual,
          });
        }
      })
    );
  }

  if (rows.length === 0) return;

  const dedupedRows = [...new Map(rows.map((r) => [`${r.date}|${r.code}`, r])).values()];
  const dates = [...new Set(dedupedRows.map((r) => r.date))];

  await prisma.$transaction([
    prisma.themeNetFlow.deleteMany({ where: { date: { in: dates } } }),
    prisma.themeNetFlow.createMany({ data: dedupedRows }),
  ]);
}

export async function getThemeNetFlowInRange(startISO: string, endISO: string) {
  return prisma.themeNetFlow.findMany({
    where: { date: { gte: startISO, lte: endISO } },
  });
}
