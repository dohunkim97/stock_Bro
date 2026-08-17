// "돈이 몰리는 테마" — ranks themes by total 거래대금(trading value) rather than
// by how often they show up in the rankings (lib/sector-aggregation.ts) or by
// average % move (lib/sector-performance.ts). Trading value is the closest
// proxy this app has for actual capital flow into a theme this week.

const EOK = 100_000_000;
const JO = EOK * 10_000; // 1조 = 1,000,000,000,000원

// Inverse of lib/format.ts's formatWon — DailyEntry.tradingValue is stored
// as that formatted string ("1조 2,345억", "890억", "12,000원"), not a raw
// number, so summing across stocks means parsing it back first. Unlike
// lib/sort.ts's parseLeadingNumber (which only needs a crude value good
// enough for *sorting*), this must recover the real magnitude since the
// result gets displayed as an actual total.
export function parseWonString(value: string | null | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, "");
  let total = 0;
  let matched = false;

  const jo = cleaned.match(/(\d+(?:\.\d+)?)\s*조/);
  if (jo) {
    total += parseFloat(jo[1]) * JO;
    matched = true;
  }
  const eok = cleaned.match(/(\d+(?:\.\d+)?)\s*억/);
  if (eok) {
    total += parseFloat(eok[1]) * EOK;
    matched = true;
  }
  if (!matched) {
    const won = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (won) total += parseFloat(won[1]);
  }
  return total;
}

export type MoneyFlowInput = {
  date: string;
  name: string;
  code: string | null;
  sector: string;
  changePct: number;
  tradingValue: string | null;
  marketCap: string | null;
};

export type MoneyFlowStock = { name: string; code: string | null; marketCap: number; changePct: number };

type ThemeBucket = {
  dailyTotals: number[];
  changeSum: number;
  changeCount: number;
  stocks: Map<string, MoneyFlowStock>;
};

// Shared grouping pass — both rankMoneyFlowByDay (the table) and
// rankMoneyFlowStocks (the leader/follower panel) need the same per-theme,
// per-day totals; this is the one place that actually reads tradingValue
// off each entry, so the two views can't drift out of sync with each other.
function buildThemeBuckets(entries: MoneyFlowInput[], days: string[]): Map<string, ThemeBucket> {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const byTheme = new Map<string, ThemeBucket>();

  // Sorted oldest-first so that, per stock, the Map write below naturally
  // ends up holding that stock's most recent day's changePct/marketCap.
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  for (const e of sorted) {
    const dayIdx = dayIndex.get(e.date);
    if (dayIdx === undefined) continue; // outside the requested window
    const value = parseWonString(e.tradingValue);
    if (value <= 0) continue;

    let bucket = byTheme.get(e.sector);
    if (!bucket) {
      bucket = { dailyTotals: new Array(days.length).fill(0), changeSum: 0, changeCount: 0, stocks: new Map() };
      byTheme.set(e.sector, bucket);
    }
    bucket.dailyTotals[dayIdx] += value;
    bucket.changeSum += e.changePct;
    bucket.changeCount += 1;
    bucket.stocks.set(e.code ?? e.name, {
      name: e.name,
      code: e.code,
      marketCap: parseWonString(e.marketCap),
      changePct: e.changePct,
    });
  }

  return byTheme;
}

export type ThemeMoneyFlowByDay = {
  name: string;
  dailyTotals: number[]; // aligned 1:1 with the `days` array passed in
  cumulativeTotal: number;
  avgChangePct: number;
};

// A rolling table — theme × the last N trading days — rather than a single
// week-bucketed total, so it reads correctly no matter where "today" falls
// inside a calendar week (a Monday doesn't leave it looking empty the way
// the "8월 3주" hot-sector panel briefly does).
export function rankMoneyFlowByDay(entries: MoneyFlowInput[], days: string[], limit = 6): ThemeMoneyFlowByDay[] {
  const byTheme = buildThemeBuckets(entries, days);

  return [...byTheme.entries()]
    .map(([name, b]) => ({
      name,
      dailyTotals: b.dailyTotals,
      cumulativeTotal: b.dailyTotals.reduce((s, v) => s + v, 0),
      avgChangePct: b.changeCount > 0 ? b.changeSum / b.changeCount : 0,
    }))
    .sort((a, b) => b.cumulativeTotal - a.cumulativeTotal)
    .slice(0, limit);
}

export type ThemeStockGroups = {
  name: string;
  cumulativeTotal: number;
  // 대표기업 — 테마 내 시가총액 상위 (선두주자로 보는 근거). 관련 중소형주는 같은
  // 테마의 시가총액 하위 종목 — "다음에 오를 종목" 예측이 아니라 참고용 목록.
  leaders: MoneyFlowStock[];
  followers: MoneyFlowStock[];
};

// Same top-N-by-cumulative theme set as rankMoneyFlowByDay, but returning
// the leader/follower stock lists instead of the day-by-day numbers — split
// out so the two can render as separate panels instead of one wide table.
export function rankMoneyFlowStocks(
  entries: MoneyFlowInput[],
  days: string[],
  limit = 6,
  stocksPerGroup = 3
): ThemeStockGroups[] {
  const byTheme = buildThemeBuckets(entries, days);

  return [...byTheme.entries()]
    .map(([name, b]) => {
      const withCap = [...b.stocks.values()].filter((s) => s.marketCap > 0).sort((a, c) => c.marketCap - a.marketCap);
      const leaders = withCap.slice(0, stocksPerGroup);
      const leaderKeys = new Set(leaders.map((s) => s.code ?? s.name));
      const followers = withCap
        .filter((s) => !leaderKeys.has(s.code ?? s.name))
        .sort((a, c) => a.marketCap - c.marketCap)
        .slice(0, stocksPerGroup);

      return {
        name,
        cumulativeTotal: b.dailyTotals.reduce((s, v) => s + v, 0),
        leaders,
        followers,
      };
    })
    .sort((a, b) => b.cumulativeTotal - a.cumulativeTotal)
    .slice(0, limit);
}

export type ThemeNetFlowInput = {
  date: string;
  name: string;
  code: string | null;
  theme: string;
  foreignNet: number;
  institutionNet: number;
};

export type NetFlowStock = { name: string; code: string | null; net: number };

export type ThemeNetRank = {
  name: string;
  totalNet: number; // cumulative 외국인+기관 순매수 over the window — +는 순매수, -는 순매도
  stockCount: number;
  stocks: NetFlowStock[];
};

// "사는 쪽이 파는 쪽보다 우세한 테마는 어디, 그 반대는 어디" — 외국인+기관 합산
// 순매수를 테마별로 합산해 랭킹. 개인은 국내 증시에서 통상 반대매매 성격(추세를
// 뒤늦게 따라가는 쪽)으로 보는 경우가 많아 "스마트 머니" 신호로는 외국인+기관을
// 본다 — 국내 HTS/증권 앱들이 "외국인+기관 순매수"를 따로 묶어 보여주는 것과
// 같은 관례.
export function rankThemeNetFlow(
  entries: ThemeNetFlowInput[],
  limit = 5,
  stocksPerTheme = 3
): { buying: ThemeNetRank[]; selling: ThemeNetRank[] } {
  const byTheme = new Map<string, { total: number; stocks: Map<string, NetFlowStock> }>();

  for (const e of entries) {
    const net = e.foreignNet + e.institutionNet;
    let bucket = byTheme.get(e.theme);
    if (!bucket) {
      bucket = { total: 0, stocks: new Map() };
      byTheme.set(e.theme, bucket);
    }
    bucket.total += net;
    const key = e.code ?? e.name;
    const existing = bucket.stocks.get(key);
    bucket.stocks.set(key, { name: e.name, code: e.code, net: (existing?.net ?? 0) + net });
  }

  const ranked = [...byTheme.entries()].map(([name, b]) => ({
    name,
    totalNet: b.total,
    stockCount: b.stocks.size,
    stocks: [...b.stocks.values()],
  }));

  const buying = ranked
    .filter((r) => r.totalNet > 0)
    .sort((a, b) => b.totalNet - a.totalNet)
    .slice(0, limit)
    .map((r) => ({ ...r, stocks: [...r.stocks].sort((a, b) => b.net - a.net).slice(0, stocksPerTheme) }));

  const selling = ranked
    .filter((r) => r.totalNet < 0)
    .sort((a, b) => a.totalNet - b.totalNet)
    .slice(0, limit)
    .map((r) => ({ ...r, stocks: [...r.stocks].sort((a, b) => a.net - b.net).slice(0, stocksPerTheme) }));

  return { buying, selling };
}
