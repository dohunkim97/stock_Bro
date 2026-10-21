// SectorStrength 모듈 (볼린저 Phase 2, 사용자 스펙 2단계 "1. 현재 시장의 주도
// 섹터와 테마 확인") — "오늘 상승률이 제일 높다"만으로 주도 섹터로 보지 말고
// 거래대금·상승 지속성·업종 내 참여 종목 수를 같이 보라는 요구를 그대로
// 구현한다. 순수 함수(prisma 의존 없음) — 호출부(향후 Phase 3)가 lib/theme-
// daily-flow.ts의 getThemeDailyFlowInRange로 가져온 로우를 그대로 넘긴다.
//
// 알아둘 제약: ThemeDailyFlow.tradingValue는 formatWon으로 이미 "1,234억원"
// 같은 문자열로 포맷되어 저장돼 있어 산술(합산/증가율)을 할 수 없다(원시
// 숫자 컬럼이 없음). 그래서 과거 거래대금 "트렌드"는 여기서 계산하지 않고,
// changePct(숫자)만으로 지속성·참여도를 본다 — 당일 거래대금이 충분한지는
// 호출부가 그 시점의 실시간 시세(fetchKisQuote)로 따로 확인해야 한다(아래
// SectorStrengthResult.note에 그 한계를 명시).

export type ThemeDailyFlowRow = { date: string; code: string; theme: string; changePct: number };

export type SectorDayStat = {
  date: string;
  avgChangePct: number;
  positiveRatio: number; // 0~100, 그 테마 종목 중 당일 상승(changePct>0) 비율
  stockCount: number;
  rank: number | null; // 그날 전체 테마 중 avgChangePct 기준 순위(1=1등). 샘플 부족한 테마는 null
  isLeading: boolean; // 그날 상위 LEADING_RANK 이내 + 최소 참여 종목 수 충족
};

export type SectorStrength = "강" | "중" | "약" | "데이터 부족";

export type SectorStrengthResult = {
  theme: string;
  days: SectorDayStat[]; // 과거→최신 순, 데이터 있는 날만
  ret1d: number | null;
  ret5d: number | null; // 최근(최대 5개) 가용일의 일별 평균 변동률을 복리로 합성
  ret20d: number | null;
  breadthLatest: number | null;
  leadingDaysRecent: number; // 최근 가용 5일 중 주도 테마였던 날수
  strength: SectorStrength;
  reasons: string[];
  note: string; // 거래대금 트렌드는 별도 확인 필요하다는 고지
};

const MIN_STOCKS_FOR_RANK = 2; // 종목 1개짜리 "테마"는 순위 경쟁에서 제외(노이즈)
const LEADING_RANK = 3; // 그날 상위 3개 테마면 "주도"로 본다
const RECENT_WINDOW = 5;

function compound(pcts: number[]): number {
  return (pcts.reduce((acc, p) => acc * (1 + p / 100), 1) - 1) * 100;
}

// allRows: 특정 날짜 구간의 전체 테마 로우(여러 테마가 섞여 있어야 날짜별
// 테마 순위를 매길 수 있다). theme: 평가 대상 테마 하나.
export function computeSectorStrength(allRows: ThemeDailyFlowRow[], theme: string): SectorStrengthResult {
  const byDate = new Map<string, ThemeDailyFlowRow[]>();
  for (const r of allRows) {
    const arr = byDate.get(r.date);
    if (arr) arr.push(r);
    else byDate.set(r.date, [r]);
  }

  const dates = [...byDate.keys()].sort();
  const days: SectorDayStat[] = [];

  for (const date of dates) {
    const rowsOfDay = byDate.get(date)!;
    const byTheme = new Map<string, ThemeDailyFlowRow[]>();
    for (const r of rowsOfDay) {
      const arr = byTheme.get(r.theme);
      if (arr) arr.push(r);
      else byTheme.set(r.theme, [r]);
    }

    const themeStats = [...byTheme.entries()].map(([name, rows]) => {
      const avgChangePct = rows.reduce((s, r) => s + r.changePct, 0) / rows.length;
      const positiveRatio = (rows.filter((r) => r.changePct > 0).length / rows.length) * 100;
      return { name, avgChangePct, positiveRatio, stockCount: rows.length };
    });

    const rankable = themeStats.filter((t) => t.stockCount >= MIN_STOCKS_FOR_RANK).sort((a, b) => b.avgChangePct - a.avgChangePct);
    const rankByName = new Map(rankable.map((t, i) => [t.name, i + 1]));

    const mine = themeStats.find((t) => t.name === theme);
    if (!mine) continue;

    const rank = rankByName.get(theme) ?? null;
    days.push({
      date,
      avgChangePct: mine.avgChangePct,
      positiveRatio: mine.positiveRatio,
      stockCount: mine.stockCount,
      rank,
      isLeading: rank !== null && rank <= LEADING_RANK,
    });
  }

  const note = "거래대금 트렌드는 저장 형식(포맷된 문자열) 때문에 여기서 계산하지 않음 — 당일 거래대금 충분 여부는 실시간 시세로 별도 확인 필요";

  if (days.length === 0) {
    return {
      theme,
      days: [],
      ret1d: null,
      ret5d: null,
      ret20d: null,
      breadthLatest: null,
      leadingDaysRecent: 0,
      strength: "데이터 부족",
      reasons: ["이 테마의 일별 데이터가 없음"],
      note,
    };
  }

  const latest = days[days.length - 1];
  const last5 = days.slice(-RECENT_WINDOW);
  const last20 = days.slice(-20);

  const ret1d = latest.avgChangePct;
  const ret5d = last5.length > 0 ? compound(last5.map((d) => d.avgChangePct)) : null;
  const ret20d = last20.length >= 10 ? compound(last20.map((d) => d.avgChangePct)) : null; // 표본 10일 미만이면 20일 추세로 부르기엔 근거 부족
  const breadthLatest = latest.positiveRatio;
  const leadingDaysRecent = last5.filter((d) => d.isLeading).length;

  const reasons: string[] = [];
  let strength: SectorStrength;
  if (days.length < 3) {
    strength = "데이터 부족";
    reasons.push(`가용 일자 ${days.length}일로 판단 근거 부족`);
  } else if (leadingDaysRecent >= 3 && breadthLatest >= 50) {
    strength = "강";
    reasons.push(`최근 ${last5.length}일 중 ${leadingDaysRecent}일 주도 테마 상위권`, `업종 내 상승종목 비율 ${breadthLatest.toFixed(0)}%`);
  } else if (leadingDaysRecent >= 1 || breadthLatest >= 40) {
    strength = "중";
    reasons.push(`최근 ${last5.length}일 중 ${leadingDaysRecent}일 상위권 진입`, `업종 내 상승종목 비율 ${breadthLatest.toFixed(0)}%`);
  } else {
    strength = "약";
    reasons.push(`최근 ${last5.length}일간 주도 테마 상위권 진입 없음`, `업종 내 상승종목 비율 ${breadthLatest.toFixed(0)}%`);
  }

  return { theme, days, ret1d, ret5d, ret20d, breadthLatest, leadingDaysRecent, strength, reasons, note };
}
