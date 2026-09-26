// 둥지(My Page) 포트폴리오의 핵심 데이터 계층 — 설정(총 시드/현금/채권/
// 대체자산/목표 비중)과 보유 종목 CRUD, 그리고 보유 종목의 실시간 평가
// (현재가·손익률·자동 손절가·AI 목표가)를 계산한다. 손절가/목표가는
// lib/candidate-detail.ts의 buildChartNote와 같은 원리(5일선/20일선,
// 최근 20거래일 고점/저점)를 쓰지만 그 파일은 "예측 후보" 전용 타입이라
// 여기서는 보유 종목에 맞는 독립된 계산으로 다시 구현한다.
//
// 구글 로그인 도입(2026-09-22) 후 모든 함수가 userId를 받는다 — 예전엔
// 사이트 전체에 둥지가 하나뿐이라 고정 id("singleton")로 조회했지만,
// 이제 로그인한 사람마다 자기 것만 보게 userId로 소유권을 나눈다
// (prisma/migrations/20260922022859_scope_portfolio_to_user 참고, 기존
// 데이터는 그 시점의 유일한 로그인 사용자에게 귀속시켰다).

import { prisma } from "@/lib/prisma";
import { fetchKisQuote } from "@/lib/kis-quote";
import { fetchKisChart } from "@/lib/kis-chart";
import { resolveStock } from "@/lib/market-data";
import { fetchKisCodeMaster, findInCodeMaster } from "@/lib/kis-code-master";

export type PortfolioSettingsData = {
  totalSeed: number;
  cashAmount: number;
  bondAmount: number;
  altAssetAmount: number;
  targetStockPct: number;
  targetBondPct: number;
  targetAltPct: number;
  targetCashPct: number;
};

export async function getPortfolioSettings(userId: string): Promise<PortfolioSettingsData> {
  const row = await prisma.portfolioSettings.findUnique({ where: { userId } });
  if (row) return row;
  return {
    totalSeed: 0,
    cashAmount: 0,
    bondAmount: 0,
    altAssetAmount: 0,
    targetStockPct: 60,
    targetBondPct: 20,
    targetAltPct: 10,
    targetCashPct: 10,
  };
}

export async function updatePortfolioSettings(userId: string, input: Partial<PortfolioSettingsData>) {
  return prisma.portfolioSettings.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
}

export function getHoldings(userId: string) {
  return prisma.portfolioHolding.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

// 종목명만으로도 추가할 수 있게 resolveStock → (실패 시) KIS 종목마스터
// 순으로 코드를 찾는다 — lib/weekly-prediction.ts의 resolveCandidateCodes와
// 같은 순서: LLM이 낀 경로가 아니라 사용자가 직접 이름을 치는 경로라도,
// 정확한 코드 없이는 실시간 시세/차트를 못 가져오니 여기서도 신뢰할 수
// 있는 소스로만 코드를 정한다.
export async function resolveHoldingCode(name: string): Promise<{ code: string; name: string } | null> {
  const local = await resolveStock(name);
  if (local) return { code: local.code, name: local.name };
  const codeMaster = await fetchKisCodeMaster();
  const found = findInCodeMaster(codeMaster, name);
  return found ? { code: found.code, name: found.name } : null;
}

export function addHolding(
  userId: string,
  input: { name: string; code: string; buyPrice: number; quantity: number; buyDate?: string | null }
) {
  return prisma.portfolioHolding.create({ data: { ...input, userId } });
}

// 매수일 수정(보유 기간 계산용) — userId까지 걸어 내 종목만 바뀌게 한다. null이면 지운다.
export async function updateHoldingBuyDate(userId: string, id: string, buyDate: string | null) {
  return prisma.portfolioHolding.updateMany({ where: { id, userId }, data: { buyDate } });
}

// deleteMany + where userId — 그냥 delete({where:{id}})를 쓰면 다른
// 사람의 id를 추측해서 지울 수 있으니(사용자별 소유권 체크 없음) 반드시
// userId까지 같이 걸어서 "내 것만" 지워지게 한다.
export async function removeHolding(userId: string, id: string) {
  const result = await prisma.portfolioHolding.deleteMany({ where: { id, userId } }).catch(() => null);
  return result;
}

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

// 실데이터 기반(5일선/20일선 + 최근 20거래일 고점/저점) — lib/candidate-
// detail.ts의 buildChartNote와 같은 규칙, 보유 종목용으로 독립 계산.
function computeStopLossAndTarget(
  closes: number[],
  currentPrice: number
): { stopLoss: number | null; target: number | null; targetPct: number | null } {
  if (closes.length < 5) return { stopLoss: null, target: null, targetPct: null };
  const s20 = sma(closes, 20);
  const window = closes.slice(-20);
  const recentHigh = Math.max(...window);
  const stopLoss = s20 ?? Math.min(...window);
  const target = recentHigh > currentPrice ? recentHigh : currentPrice * 1.05;
  const targetPct = currentPrice > 0 ? ((target - currentPrice) / currentPrice) * 100 : null;
  return { stopLoss, target, targetPct };
}

export type RiskStatus = "정상" | "손절가 근접" | "손절가 이탈";

export type HoldingWithLiveData = {
  id: string;
  name: string;
  code: string;
  buyPrice: number;
  quantity: number;
  buyDate: string | null;
  currentPrice: number | null;
  valuation: number | null; // currentPrice * quantity
  changePct: number | null; // vs buyPrice
  stopLoss: number | null;
  target: number | null;
  targetPct: number | null;
  riskStatus: RiskStatus | null;
};

// 종목 하나당 시세 1회 + 차트 1회 — 보유 종목이 많아야 한 자릿수~십수 개
// 수준일 걸 감안해 병렬로 다 가져온다(Promise.all), 페이지 하나에 순차
// 호출 여러 번을 쌓지 않는다.
export async function getHoldingsWithLiveData(userId: string): Promise<HoldingWithLiveData[]> {
  const holdings = await getHoldings(userId);
  if (holdings.length === 0) return [];

  const [quotes, chartsCloses] = await Promise.all([
    Promise.all(holdings.map((h) => fetchKisQuote(h.code))),
    Promise.all(holdings.map((h) => fetchKisChart(h.code, "D").then((cs) => cs.map((c) => c.close)))),
  ]);

  return holdings.map((h, i) => {
    const quote = quotes[i];
    const closes = chartsCloses[i];
    const currentPrice = quote?.price ?? (closes.length > 0 ? closes[closes.length - 1] : null);
    if (currentPrice === null) {
      return {
        id: h.id,
        name: h.name,
        code: h.code,
        buyPrice: h.buyPrice,
        quantity: h.quantity,
        buyDate: h.buyDate,
        currentPrice: null,
        valuation: null,
        changePct: null,
        stopLoss: null,
        target: null,
        targetPct: null,
        riskStatus: null,
      };
    }

    const { stopLoss, target, targetPct } = computeStopLossAndTarget(closes, currentPrice);
    const changePct = h.buyPrice > 0 ? ((currentPrice - h.buyPrice) / h.buyPrice) * 100 : null;

    let riskStatus: RiskStatus | null = null;
    if (stopLoss !== null) {
      if (currentPrice <= stopLoss) riskStatus = "손절가 이탈";
      else if (((currentPrice - stopLoss) / stopLoss) * 100 <= 3) riskStatus = "손절가 근접";
      else riskStatus = "정상";
    }

    return {
      id: h.id,
      name: h.name,
      code: h.code,
      buyPrice: h.buyPrice,
      quantity: h.quantity,
      buyDate: h.buyDate,
      currentPrice,
      valuation: currentPrice * h.quantity,
      changePct,
      stopLoss,
      target,
      targetPct,
      riskStatus,
    };
  });
}

export type AllocationCategory = {
  key: "stock" | "bond" | "alt" | "cash";
  label: string;
  amount: number;
  pct: number; // of total valuation
  targetPct: number;
};

export type PortfolioOverview = {
  totalSeed: number;
  totalValuation: number;
  cashAmount: number;
  profitPct: number | null;
  allocation: AllocationCategory[];
};

export function computeOverview(settings: PortfolioSettingsData, holdings: HoldingWithLiveData[]): PortfolioOverview {
  const stockValuation = holdings.reduce((sum, h) => sum + (h.valuation ?? h.buyPrice * h.quantity), 0);
  const totalValuation = stockValuation + settings.cashAmount + settings.bondAmount + settings.altAssetAmount;
  const pct = (amount: number) => (totalValuation > 0 ? (amount / totalValuation) * 100 : 0);

  const allocation: AllocationCategory[] = [
    { key: "stock", label: "국내/해외 주식", amount: stockValuation, pct: pct(stockValuation), targetPct: settings.targetStockPct },
    { key: "bond", label: "채권 및 안전자산", amount: settings.bondAmount, pct: pct(settings.bondAmount), targetPct: settings.targetBondPct },
    { key: "alt", label: "대체자산 (금/코인)", amount: settings.altAssetAmount, pct: pct(settings.altAssetAmount), targetPct: settings.targetAltPct },
    { key: "cash", label: "현금 및 예수금", amount: settings.cashAmount, pct: pct(settings.cashAmount), targetPct: settings.targetCashPct },
  ];

  return {
    totalSeed: settings.totalSeed,
    totalValuation,
    cashAmount: settings.cashAmount,
    profitPct: settings.totalSeed > 0 ? ((totalValuation - settings.totalSeed) / settings.totalSeed) * 100 : null,
    allocation,
  };
}
