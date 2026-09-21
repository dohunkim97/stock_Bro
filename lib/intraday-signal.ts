// 장중 실시간 초단기 시그널 — 사용자가 보내준 "하루 6분 모델(햄버거
// 기법)" 요약을 이 앱의 기존 데이터/실행 방식에 맞게 옮긴 것.
//
// 원 기법: 과거 상승 시작 캔들의 "기준 거래대금"을 미리 표시해두고, 당일
// 같은 수준의 거래대금이 다시 터지는 순간(+양봉+아래꼬리+섹터 동반 강세)
// 을 장 시작 직후 몇 분 안에 포착해 매수, "수익을 줄 때 튀어라"(목표수익
// 도달 또는 5선 이탈 시 매도).
//
// 이 앱에 맞춘 각색:
//   - "기준 거래대금"을 과거 특정 상승일의 분봉에서 따로 캐내는 대신(그
//     날짜의 분봉 과거 조회는 KIS 쪽 지원이 불확실하고 종목마다 매번 새로
//     찾아야 해서 실시간 스캐너로는 비쌈), 오늘 그 종목 자신의 "직전 몇
//     분봉 평균 거래대금" 대비 급증(BASELINE_MULTIPLIER배 이상)을 기준으로
//     삼는다 — "평소보다 비정상적으로 큰 매수세가 지금 들어왔다"는 원
//     기법의 핵심 신호는 그대로 유지하면서, 매 분마다 여러 종목을 도는
//     실시간 스캐너에 맞게 계산량을 줄인 근사.
//   - "섹터 전체 자금 유입 확인"은 정확한 자금 유입액 계산 대신, 같은
//     테마(StockTheme)로 묶인 종목이 오늘 여럿 동반 포착됐는지로 근사.
//   - 실제 매수 주문은 넣지 않는다(이 앱은 리서치/기록 도구) — "그 순간에
//     매수했다고 가정"하고 그 뒤 가격을 계속 추적해서 기록한다.

import { prisma } from "@/lib/prisma";
import { fetchKisMinuteChart, type MinuteCandle } from "@/lib/kis-minute-chart";
import { fetchKisQuote } from "@/lib/kis-quote";
import { todayISO, currentMarketStatus } from "@/lib/dates";

// 평소(직전 분봉 평균) 대비 이만큼 이상 거래대금이 튀어야 "기준 거래대금
// 돌파"로 본다 — 원 기법의 "기준 거래대금"이 절대값이 아니라 "평소와
// 다른 이상 신호"라는 점에 착안한 상대적 기준.
const BASELINE_MULTIPLIER = 3;
const SHORTLIST_SIZE = 15;
const SCAN_CONCURRENCY = 3;
const TARGET_PROFIT_PCT = 3; // 하루 안 청산이 기본이라 목표수익은 낮게 잡음
const MA_WINDOW = 5; // "5선 이탈 시 매도" — 분봉 5개 단순이동평균

// scan(장 시작 직후 포착)과 monitor(청산 확인)를 원래 각자 1분/5분 간격의
// 별도 크론 2개로 돌렸는데, 배포가 계속 실패하는 사고로 이어졌다(2026-
// 09-16 밤~2026-09-21). 진짜 원인은 이 계정(Hobby 요금제)의 Cron Jobs
// 설정 화면에서 확인됨: "Cron jobs on Hobby have a flexible time window
// of 1-hour" — 즉 크론 하나가 시간당 1번을 넘어 도는 스케줄(1분/5분/10분
// 간격 전부 포함)은 개수·문법과 무관하게 애초에 등록 자체가 거부된다.
// 그래서 크론 1개(시간당 정확히 1번, 하루 7회)로 합치고 그 안에서 "지금이
// 스캔 구간인지"만 시간으로 갈라 판단한다 — runIntradayCycle이 그 진입점.
const OPEN_MINUTES = 9 * 60; // 09:00 KST
const SCAN_WINDOW_MINUTES = 60; // 장 시작 후 이 시간까지만 새 시그널을 찾는다(그 이후는 이미 포착된 것만 추적) — 시간당 1회 호출이라 09:00/10:00 두 번의 호출이 여기 걸린다

function minutesSinceMidnightKST(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return get("hour") * 60 + get("minute");
}

// 오늘 스캔할 후보 — 최근 이슈가 붙어 시장이 이미 주목 중인 종목 위주로
// 좁힌다(lib/weekly-prediction.ts의 signalShortlistBlock과 같은 소스).
// 전 종목을 매분 스캔하면 KIS 레이트리밋에 바로 걸린다.
async function shortlist(): Promise<{ name: string; code: string; theme?: string }[]> {
  const rows = await prisma.dailyEntry.findMany({
    where: { issue: { not: null }, code: { not: null } },
    orderBy: { createdAt: "desc" },
    take: SHORTLIST_SIZE * 2,
  });
  const seen = new Set<string>();
  const picked = rows.filter((r) => (seen.has(r.code!) ? false : (seen.add(r.code!), true))).slice(0, SHORTLIST_SIZE);
  if (picked.length === 0) return [];

  const themes = await prisma.stockTheme.findMany({ where: { code: { in: picked.map((p) => p.code!) } } });
  const themeByCode = new Map(themes.map((t) => [t.code, t.theme]));
  return picked.map((p) => ({ name: p.name, code: p.code!, theme: themeByCode.get(p.code!) }));
}

// 몸통 대비 아래꼬리가 뚜렷하면(원 기법: "긴 아래꼬리 = 매수세가 강하다는
// 점을 시사") 강한 매수세로 판단.
function hasLowerWick(c: MinuteCandle): boolean {
  const body = Math.abs(c.close - c.open);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  return lowerWick > body * 0.3;
}

// 장 시작 직후 몇 분 안에(vercel.json의 intraday-scan 스케줄이 이 함수를
// 반복 호출) "거래대금 급증 + 양봉" 캔들을 실시간으로 찾는다. 오늘 이미
// 포착된 종목은 다시 스캔하지 않는다(같은 종목이 하루에 여러 번 시그널을
// 내면 오히려 노이즈).
export async function scanIntradaySignals(): Promise<void> {
  const date = todayISO();
  const targets = await shortlist();
  if (targets.length === 0) return;

  const already = await prisma.intradaySignal.findMany({ where: { date }, select: { code: true } });
  const alreadyCodes = new Set(already.map((r) => r.code));
  const remaining = targets.filter((t) => !alreadyCodes.has(t.code));
  if (remaining.length === 0) return;

  for (let i = 0; i < remaining.length; i += SCAN_CONCURRENCY) {
    const batch = remaining.slice(i, i + SCAN_CONCURRENCY);
    await Promise.all(batch.map((t) => scanOne(date, t)));
  }

  await confirmSectorFlow(date);
}

async function scanOne(date: string, t: { name: string; code: string; theme?: string }): Promise<void> {
  const candles = await fetchKisMinuteChart(t.code);
  if (candles.length < 3) return;

  // 누적거래대금(acml_tr_pbmn)을 캔들 간 차분해서 "그 캔들 자체"의
  // 거래대금을 구한다.
  const perCandleValue: number[] = [];
  for (let j = 1; j < candles.length; j++) {
    perCandleValue.push(Math.max(0, candles[j].tradingValue - candles[j - 1].tradingValue));
  }
  if (perCandleValue.length < 2) return;

  const latest = candles[candles.length - 1];
  const latestValue = perCandleValue[perCandleValue.length - 1];
  const priorValues = perCandleValue.slice(0, -1);
  const baseline = priorValues.reduce((s, v) => s + v, 0) / priorValues.length;
  if (baseline <= 0 || latestValue < baseline * BASELINE_MULTIPLIER) return;

  const bullish = latest.close > latest.open;
  if (!bullish) return; // 원 기법: "양봉으로 마무리되는 것이 중요"

  await prisma.intradaySignal
    .create({
      data: {
        date,
        code: t.code,
        name: t.name,
        theme: t.theme ?? null,
        detectedAt: `${latest.time.slice(0, 2)}:${latest.time.slice(2, 4)}`,
        triggerPrice: latest.close,
        triggerValue: latestValue,
        baselineValue: baseline,
        isBullish: bullish,
        hasLowerWick: hasLowerWick(latest),
      },
    })
    .catch(() => {}); // 동시 실행 등으로 인한 unique 충돌은 무시(멱등)
}

// 같은 테마로 묶인 종목이 오늘 여럿 포착됐으면 "섹터 전체 자금 유입"으로
// 근사 확인 — 원 기법의 "섹터 시황·자금 유입 확인" 단계.
async function confirmSectorFlow(date: string): Promise<void> {
  const todaySignals = await prisma.intradaySignal.findMany({ where: { date } });
  const byTheme = new Map<string, number>();
  for (const s of todaySignals) {
    if (!s.theme) continue;
    byTheme.set(s.theme, (byTheme.get(s.theme) ?? 0) + 1);
  }
  for (const s of todaySignals) {
    const count = s.theme ? (byTheme.get(s.theme) ?? 0) : 0;
    if (count >= 2 && !s.sectorConfirmed) {
      await prisma.intradaySignal.update({ where: { id: s.id }, data: { sectorConfirmed: true } }).catch(() => {});
    }
  }
}

async function closeSignal(id: string, price: number, hhmm: string, status: string, pct: number): Promise<void> {
  await prisma.intradaySignal
    .update({ where: { id }, data: { status, exitPrice: price, exitAt: hhmm, finalPct: pct } })
    .catch(() => {});
}

// 이미 포착된(open 상태) 시그널을 장중 주기적으로 다시 확인해서 목표수익
// 도달(target) 또는 5선 이탈(ma_break)로 청산 처리한다 — 원 기법: "햄버거
// 기법은 장기간 보유하는 기법이 아니다", "수익을 줄 때 튀어라".
export async function monitorIntradaySignals(): Promise<void> {
  const date = todayISO();
  const open = await prisma.intradaySignal.findMany({ where: { date, status: "open" } });
  if (open.length === 0) return;

  for (let i = 0; i < open.length; i += SCAN_CONCURRENCY) {
    const batch = open.slice(i, i + SCAN_CONCURRENCY);
    await Promise.all(
      batch.map(async (s) => {
        const candles = await fetchKisMinuteChart(s.code);
        if (candles.length === 0) return;
        const latest = candles[candles.length - 1];
        const hhmm = `${latest.time.slice(0, 2)}:${latest.time.slice(2, 4)}`;
        const changePct = ((latest.close - s.triggerPrice) / s.triggerPrice) * 100;

        if (changePct >= TARGET_PROFIT_PCT) {
          await closeSignal(s.id, latest.close, hhmm, "target", changePct);
          return;
        }
        if (candles.length >= MA_WINDOW) {
          const ma = candles.slice(-MA_WINDOW).reduce((sum, c) => sum + c.close, 0) / MA_WINDOW;
          if (latest.close < ma) {
            await closeSignal(s.id, latest.close, hhmm, "ma_break", changePct);
          }
        }
      })
    );
  }
}

// 장 마감 후 첫 호출에서 그때까지 안 청산된 시그널을 전부 현재가 기준
// 강제 청산한다 — "장기간 보유하는 기법이 아니다" 원칙을 지키기 위해
// 다음날로 넘기지 않는다.
export async function closeOutIntradaySignals(): Promise<void> {
  const date = todayISO();
  const open = await prisma.intradaySignal.findMany({ where: { date, status: "open" } });
  if (open.length === 0) return;

  for (const s of open) {
    const quote = await fetchKisQuote(s.code);
    if (!quote) continue;
    const pct = ((quote.price - s.triggerPrice) / s.triggerPrice) * 100;
    const now = new Date();
    const hh = String((now.getUTCHours() + 9) % 24).padStart(2, "0");
    const mm = String(now.getUTCMinutes()).padStart(2, "0");
    await closeSignal(s.id, quote.price, `${hh}:${mm}`, "eod", pct);
  }
}

// 크론 하나(app/api/cron/intraday-monitor/route.ts, 시간당 1번)의 진입점 —
// 장중이면 "아직 장 시작 직후(SCAN_WINDOW_MINUTES 이내)"일 때만 새 시그널
// 스캔을 같이 돌리고, 그 외엔(이미 스캔 구간을 지났거나 장이 끝났으면)
// 이미 포착된 시그널의 청산 확인/장마감 강제 청산만 한다.
export async function runIntradayCycle(): Promise<void> {
  if (!currentMarketStatus().isOpen) {
    await closeOutIntradaySignals();
    return;
  }
  if (minutesSinceMidnightKST() <= OPEN_MINUTES + SCAN_WINDOW_MINUTES) {
    await scanIntradaySignals();
  }
  await monitorIntradaySignals();
}

export type IntradaySignalRow = Awaited<ReturnType<typeof prisma.intradaySignal.findMany>>[number];

export async function getTodayIntradaySignals(): Promise<IntradaySignalRow[]> {
  const date = todayISO();
  return prisma.intradaySignal.findMany({ where: { date }, orderBy: { detectedAt: "asc" } });
}

export type IntradaySignalDay = { date: string; signals: IntradaySignalRow[] };

// 사용자가 장중에 못 보고 지나간 날들을 나중에 몰아서 확인할 수 있게
// 오늘을 제외한 지난 며칠치를 날짜별로 묶어서 돌려준다(최신 날짜 먼저) —
// components/bro/intraday-signal-panel.tsx의 "지난 기록" 섹션에서 쓴다.
export async function getRecentIntradaySignals(days: number): Promise<IntradaySignalDay[]> {
  const today = todayISO();
  const rows = await prisma.intradaySignal.findMany({
    where: { date: { not: today } },
    orderBy: [{ date: "desc" }, { detectedAt: "asc" }],
  });

  const byDate = new Map<string, IntradaySignalRow[]>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  return [...byDate.entries()].slice(0, days).map(([date, signals]) => ({ date, signals }));
}
