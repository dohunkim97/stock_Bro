import { fetchKrxDayRanking } from "@/lib/krx-sync";
import { replaceDayEntries, type UploadRow } from "@/lib/market-data";
import { todayISO, toYYYYMMDD, recentBusinessDays } from "@/lib/dates";
import { extractThemes, saveThemes } from "@/lib/theme-extraction";
import { syncThemeEtfs } from "@/lib/kis-etf-holdings";
import { fetchNews } from "@/lib/naver-news";
import { syncThemeDailyFlow, getThemeDailyFlowInRange } from "@/lib/theme-daily-flow";
import { syncThemeNetFlow, getThemeNetFlowInRange } from "@/lib/theme-net-flow";
import { rankMoneyFlowByDay, rankThemeNetFlow } from "@/lib/money-flow";
import { generateMoneyFlowTake } from "@/lib/money-flow-take";
import { filterToCurrentTheme } from "@/lib/theme-lookup";

// The KIS live-sync path already pulls one real news headline per stock
// (lib/kis-ranking.ts, for the "📰 이슈" line on the ranking tables) — this
// runs that same headline batch through theme extraction too, so themes get
// populated automatically every sync instead of only when a user happens to
// forward a Telegram article. One Claude call per sync, not per stock.
async function extractThemesFromIssues(rows: UploadRow[]): Promise<void> {
  const byName = new Map<string, string>();
  for (const r of rows) {
    if (r.issue && !byName.has(r.name)) byName.set(r.name, r.issue);
  }
  if (byName.size === 0) return;

  const text = [...byName.entries()].map(([name, issue]) => `${name}: ${issue}`).join("\n");

  try {
    const themes = await extractThemes(text, 1500);
    await saveThemes(themes, "KIS 종목뉴스 자동수집");
  } catch {
    // best-effort — a failure here shouldn't undo the sync that already succeeded
  }
}

const RETRY_DELAY_MS = 5000;

// One retry after a short pause for a step that's shown intermittent,
// unexplained failures in production (syncThemeDailyFlow/syncThemeNetFlow —
// see the comment where this is used) — still best-effort overall (logs and
// gives up rather than throwing) since one blank day shouldn't take down
// the rest of the sync, but a single retry meaningfully cuts how often that
// actually happens for a likely-transient cause like a rate limit.
async function withRetry(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[sync-runner] ${label} failed, retrying once:`, e);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      await fn();
    } catch (e2) {
      console.error(`[sync-runner] ${label} failed again after retry:`, e2);
    }
  }
}

const NAVER_NEWS_CONCURRENCY = 15;
const NAVER_NEWS_STOCK_CAP = 25;

// A second, independent news read on top of KIS's terse ranking headline —
// real article title + description, which tends to carry more of the "왜"
// context a short headline drops. Capped to the most actively-ranked names
// (not every stock synced today) to keep this from dominating the sync's
// time budget.
async function extractThemesFromNaverNews(names: string[]): Promise<void> {
  const capped = names.slice(0, NAVER_NEWS_STOCK_CAP);
  const lines: string[] = [];

  for (let i = 0; i < capped.length; i += NAVER_NEWS_CONCURRENCY) {
    const batch = capped.slice(i, i + NAVER_NEWS_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (name) => {
        const items = await fetchNews(name, 1);
        return items[0] ? `${name}: ${items[0].title} — ${items[0].description}` : null;
      })
    );
    lines.push(...results.filter((r): r is string => r !== null));
  }
  if (lines.length === 0) return;

  try {
    const themes = await extractThemes(lines.join("\n"), 1500);
    await saveThemes(themes, "네이버 뉴스 자동수집");
  } catch {
    // best-effort
  }
}

// 이 둘은 별개다 — THEME_NET_FLOW_SYNC_DAYS는 syncThemeNetFlow가 종목별로
// 얼마나 과거까지 순매수 이력을 받아오는지(마켓 페이지 "최근 10거래일" 패널이
// 쓰는 저장 데이터 자체의 폭)이고, MONEY_FLOW_TAKE_DAYS는 그 저장된 데이터
// 중 골구의 투자 방향 코멘트가 며칠치를 누적해서 볼지다. 하나로 합쳐 쓰면
// 코멘트용 기간을 줄일 때 저장되는 이력 자체도 같이 줄어서 마켓 페이지
// 패널이 10일치를 못 채우게 된다.
const THEME_NET_FLOW_SYNC_DAYS = 10;
const MONEY_FLOW_TAKE_DAYS = 5;

// Recomputes the same market-interest table + net-flow ranking the market
// page renders (lib/money-flow.ts) — ThemeDailyFlow (every themed stock's
// real daily trading value, regardless of top-30 ranking visibility) for
// "관심", ThemeNetFlow (외국인+기관 순매수) for "매수 우세/매도 우세" — then has
// Golgoo write a short "where would I look first" take on it. Best-effort —
// a sync that populated real data shouldn't fail just because this one
// write-up step did.
async function generateTodaysMoneyFlowTake(date: string): Promise<void> {
  try {
    const days = recentBusinessDays(date, MONEY_FLOW_TAKE_DAYS);
    const [flowRows, netRows] = await Promise.all([
      getThemeDailyFlowInRange(days[0], date),
      getThemeNetFlowInRange(days[0], date),
    ]);
    // filterToCurrentTheme matters here too: a reclassified stock's older
    // rows would otherwise still count toward its old theme's totals, which
    // is exactly the stale-theme mismatch users see in the money-flow panels
    // themselves (see components/market/day-view.tsx) — Golgoo's take should
    // reason from the same current-theme-only view those panels show.
    const themed = await filterToCurrentTheme(
      flowRows.map((r) => ({
        date: r.date,
        name: r.name,
        code: r.code,
        sector: r.theme,
        changePct: r.changePct,
        tradingValue: r.tradingValue,
        marketCap: r.marketCap,
      })),
      (e) => e.sector
    );
    const netRowsThemed = await filterToCurrentTheme(netRows, (e) => e.theme);

    const table = rankMoneyFlowByDay(themed, days);
    const netFlow = rankThemeNetFlow(netRowsThemed);
    await generateMoneyFlowTake(date, days.length, table, netFlow);
  } catch {
    // best-effort
  }
}

export async function runMarketSync(dateIso?: string) {
  const date = dateIso ?? todayISO();
  const basDt = toYYYYMMDD(date);
  const { volume, gainer, loser, rawCount } = await fetchKrxDayRanking(basDt);

  if (rawCount === 0) {
    return {
      ok: false,
      skipped: true,
      reason: "해당 날짜에 KRX 데이터가 없어요 (휴장일이거나 아직 집계 전일 수 있어요)",
      date,
    };
  }

  await replaceDayEntries(date, { volume, gainer, loser });

  const allRows = [...volume, ...gainer, ...loser];
  const uniqueNames = [...new Set(allRows.map((r) => r.name))];

  // ETF holdings first and awaited alone (authoritative, upserts
  // unconditionally) — the two news-based passes run after, in parallel,
  // since they're both best-effort and independent of each other.
  await syncThemeEtfs().catch((e) => console.error("[sync-runner] syncThemeEtfs failed:", e));
  await Promise.all([extractThemesFromIssues(allRows), extractThemesFromNaverNews(uniqueNames)]);
  // Needs the theme tagging above to have already landed — today's newly
  // tagged stocks should get their trading value/net-buying captured too,
  // not just yesterday's known set. Independent of each other, so parallel.
  //
  // These used to fail completely silently (bare .catch(() => {})) — a real
  // gap surfaced this: 2026-08-24's ThemeDailyFlow ended up with zero rows
  // (confirmed the pipeline itself is healthy — a same-day manual rerun for
  // a later date completed normally in ~15s), and there was no error trace
  // anywhere to say why that one day's run came up empty. Logging now AND
  // retrying once after a short delay — the same intermittent gap recurred
  // (2026-08-27~08-31 both went stale again), so logging alone wasn't
  // enough; whatever transient condition causes this (KIS rate limiting
  // under load is the leading suspect, going by lib/kis-quote.ts's own
  // comment about burst failures) is worth one automatic retry before
  // giving up for the day.
  await Promise.all([
    withRetry("syncThemeDailyFlow", () => syncThemeDailyFlow(date)),
    withRetry("syncThemeNetFlow", () => syncThemeNetFlow(THEME_NET_FLOW_SYNC_DAYS)),
  ]);
  await generateTodaysMoneyFlowTake(date);

  return {
    ok: true,
    skipped: false,
    date,
    volumeCount: volume.length,
    gainerCount: gainer.length,
    loserCount: loser.length,
  };
}
