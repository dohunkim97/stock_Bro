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
