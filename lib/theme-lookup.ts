import { prisma } from "@/lib/prisma";

// Overrides a stock's broad KRX sector (e.g. "건설") with a Telegram-derived
// investment theme (e.g. "태양광") wherever one is known for that exact
// company name. Falls back to the original sector for everything else,
// since most ranked stocks were never mentioned in a forwarded article.
export async function applyThemes<T extends { name: string; sector: string }>(
  entries: T[]
): Promise<T[]> {
  const names = [...new Set(entries.map((e) => e.name))];
  if (names.length === 0) return entries;

  const themes = await prisma.stockTheme.findMany({ where: { name: { in: names } } });
  if (themes.length === 0) return entries;

  const byName = new Map(themes.map((t) => [t.name, t.theme]));
  return entries.map((e) => {
    const theme = byName.get(e.name);
    return theme ? { ...e, sector: theme } : e;
  });
}

// ThemeDailyFlow/ThemeNetFlow rows carry a `theme` snapshot taken at sync
// time, not a live join — so when a stock gets reclassified (e.g. from
// 로봇·휴머노이드 to 반도체 as its ETF-holdings source changes), its older
// rows keep showing up under the theme it no longer belongs to, with
// whatever changePct/net figure was last synced under that stale label.
// Drops any entry whose stored theme no longer matches the stock's current
// StockTheme.theme so a reclassified stock only ever appears under its
// current theme. Only filters on a proven mismatch — an entry for a code
// with no current StockTheme row (e.g. removed entirely) is left alone
// rather than guessed at.
export async function filterToCurrentTheme<T extends { code: string | null; sector: string }>(
  entries: T[]
): Promise<T[]> {
  const codes = [...new Set(entries.map((e) => e.code).filter((c): c is string => !!c))];
  if (codes.length === 0) return entries;

  const themes = await prisma.stockTheme.findMany({ where: { code: { in: codes } } });
  const themeByCode = new Map(themes.map((t) => [t.code!, t.theme]));

  return entries.filter((e) => {
    if (!e.code) return true;
    const current = themeByCode.get(e.code);
    return current === undefined || current === e.sector;
  });
}

// Like applyThemes, but drops everything that has no theme match instead of
// falling back to the raw KRX sector — used for a "테마상위" ranking that
// should only ever show real themes, not broad sector names standing in.
export async function onlyThemed<T extends { name: string; sector: string }>(
  entries: T[]
): Promise<T[]> {
  const names = [...new Set(entries.map((e) => e.name))];
  if (names.length === 0) return [];

  const themes = await prisma.stockTheme.findMany({ where: { name: { in: names } } });
  if (themes.length === 0) return [];

  const byName = new Map(themes.map((t) => [t.name, t.theme]));
  return entries
    .filter((e) => byName.has(e.name))
    .map((e) => ({ ...e, sector: byName.get(e.name)! }));
}
