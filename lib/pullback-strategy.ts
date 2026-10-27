// TechnicalSignal 결합 모듈 (볼린저 Phase 2) — 사용자 스펙 4~5단계 "매수 신호
// 분류"/"익절 신호 분류"를 그대로 구현한다. 아래 기존 Phase 1~2 모듈들의
// 계산 결과만 입력으로 받아 상태를 판정하는 순수 함수다(직접 네트워크/DB
// 호출 없음 — Phase 3가 실제 데이터를 모아 여기 넘긴다).
//
// 지킨 원칙(스펙 6/11번 그대로):
// - 볼린저밴드 하단/상단에 닿았다는 이유만으로 자동 매수·매도 신호를 만들지
//   않는다 — 항상 섹터·재료·거래량·추세를 함께 본다.
// - 조건은 전부 개별로 충족/부족을 표시한다(모두 충족을 강제하지 않음).
// - 데이터가 없는 조건은 null(판단 불가)로 두고 충족/미충족으로 섣불리
//   단정하지 않는다.
// - 이 모듈은 "하단 밴드에 근접한 종목"을 평가하는 용도다. %B가 밴드 내부
//   깊숙이 있으면(0.3 초과 0.8 미만) 매수 4상태 중 어디에도 억지로 끼워
//   맞추지 않고 "해당 없음"으로 명시한다.

import type { BollingerAnalysis } from "@/lib/bollinger";
import type { SectorStrengthResult } from "@/lib/sector-strength";
import type { CatalystCheck } from "@/lib/catalyst-validator";
import type { VolumeFlowResult } from "@/lib/volume-flow";
import type { RiskAssessment } from "@/lib/risk-filter";

export type ConditionCheck = { label: string; met: boolean | null; detail: string };

export type BuyState = "매수 관심 구간" | "반등 확인 필요" | "조건부 진입 후보" | "매수 회피 / 위험 점검" | "해당 없음(밴드 하단 근접 아님)";
export type SellState = "익절 관찰" | "분할 익절 검토" | "강한 상승 추세 / 추적 관리" | "해당 없음(밴드 상단 근접 아님)";

export type PullbackAssessment = {
  buyState: BuyState;
  buyConditions: ConditionCheck[];
  sellState: SellState;
  sellConditions: ConditionCheck[];
  riskWarnings: string[];
};

export type PullbackInputs = {
  bollinger: BollingerAnalysis;
  sector: SectorStrengthResult;
  catalyst: CatalystCheck;
  volumeFlow: VolumeFlowResult;
  risk: RiskAssessment;
  // 중대 공시 위험 — DART 등 외부 확인이 필요해 이 모듈 밖에서 판단해 넘긴다.
  // 모르면 null(판단 불가)로 둔다. true일 때만 매수 회피 조건으로 작동한다.
  majorDisclosureRisk: boolean | null;
  // 거래정지 등 정상 거래 불가 상태 — 호출부가 시세 조회 실패/정지 코드로 판단.
  tradingHalted: boolean;
};

const LOWER_NEAR_THRESHOLD = 0.3; // 이보다 %B가 높으면 "하단 근접"으로 안 본다
const UPPER_NEAR_THRESHOLD = 0.8; // 스펙 5단계 상태1 기준 그대로
const SECTOR_OK = new Set(["강", "중"]);

function sectorOk(sector: SectorStrengthResult): boolean | null {
  if (sector.strength === "데이터 부족") return null;
  return SECTOR_OK.has(sector.strength);
}

function classifyBuy(input: PullbackInputs): { state: BuyState; conditions: ConditionCheck[]; warnings: string[] } {
  const { bollinger, sector, catalyst, volumeFlow, risk, majorDisclosureRisk, tradingHalted } = input;
  const latest = bollinger.latest;
  const warnings: string[] = [];

  if (tradingHalted) {
    return {
      state: "매수 회피 / 위험 점검",
      conditions: [{ label: "거래정지 등 정상 거래 불가", met: true, detail: "호출부가 거래정지/시세 이상으로 보고함" }],
      warnings: ["거래정지 등 정상 거래가 불가능한 상태"],
    };
  }

  if (latest === null) {
    return {
      state: "해당 없음(밴드 하단 근접 아님)",
      conditions: [{ label: "볼린저밴드 계산 가능 여부", met: false, detail: "캔들 수 부족으로 밴드를 계산할 수 없음" }],
      warnings: [],
    };
  }

  // --- 매수 회피(상태4) 우선 판정: 하나라도 걸리면 다른 상태보다 우선한다 ---
  const change5d = risk.overheat.change5dPct;
  const avoidConditions: ConditionCheck[] = [
    { label: "지속적인 급락", met: change5d !== null ? change5d <= -15 : null, detail: change5d !== null ? `최근 5거래일 ${change5d.toFixed(1)}%` : "데이터 부족" },
    {
      label: "업종 전체 강한 하락 전환",
      met: sector.strength === "약" && sector.ret5d !== null ? sector.ret5d < -5 : sector.strength === "데이터 부족" ? null : false,
      detail: sector.ret5d !== null ? `테마 5일 수익률 ${sector.ret5d.toFixed(1)}%` : "데이터 부족",
    },
    { label: "중대 악재·투자 논리 훼손", met: majorDisclosureRisk, detail: majorDisclosureRisk === null ? "확인 안됨(판단 불가)" : majorDisclosureRisk ? "중대 공시 위험 확인됨" : "확인된 위험 없음" },
    {
      label: "유동성 부족",
      met: volumeFlow.volumeMultiple !== null ? volumeFlow.volumeMultiple < 0.3 : null,
      detail: volumeFlow.volumeMultiple !== null ? `오늘 거래량 20일 평균의 ${(volumeFlow.volumeMultiple * 100).toFixed(0)}%` : "데이터 부족",
    },
    { label: "하락 중 거래량 급증(투매 의심)", met: volumeFlow.evaluation === "고점 매물성 거래량 의심", detail: volumeFlow.reasons.join("; ") },
    { label: "과도한 상승 이후 추세 붕괴", met: risk.overheat.overheatScore >= 50 && bollinger.slope === "하락", detail: `과열점수 ${risk.overheat.overheatScore}, 중심선 ${bollinger.slope ?? "판단불가"}` },
  ];
  const avoidTriggered = avoidConditions.some((c) => c.met === true);
  if (avoidTriggered) {
    warnings.push(...avoidConditions.filter((c) => c.met === true).map((c) => c.label));
    return { state: "매수 회피 / 위험 점검", conditions: avoidConditions, warnings };
  }

  // %B가 하단 근접 범위 밖이면 이 전략 자체가 적용 대상이 아니다.
  if (latest.percentB === null || latest.percentB > LOWER_NEAR_THRESHOLD) {
    return {
      state: "해당 없음(밴드 하단 근접 아님)",
      conditions: [{ label: "밴드 하단 근접(%B ≤ 0.2~0.3)", met: latest.percentB !== null ? latest.percentB <= LOWER_NEAR_THRESHOLD : null, detail: latest.percentB !== null ? `%B ${latest.percentB.toFixed(2)}` : "데이터 예외(상단=하단)" }],
      warnings: [],
    };
  }

  const near02 = latest.percentB <= 0.2;
  const sectorPositive = sectorOk(sector);
  const base: ConditionCheck[] = [
    { label: "현재 시장 주도 섹터에 속함", met: sectorPositive, detail: `테마 강도: ${sector.strength}, ${sector.reasons.join(", ")}` },
    { label: "최근 관련 뉴스·재료 확인", met: catalyst.valid, detail: catalyst.reasons.join("; ") },
    { label: "%B 0.2 이하(하단 근접)", met: near02, detail: `%B ${latest.percentB.toFixed(2)}` },
    { label: "중대한 공시 위험 없음", met: majorDisclosureRisk === null ? null : !majorDisclosureRisk, detail: majorDisclosureRisk === null ? "확인 안됨(판단 불가)" : majorDisclosureRisk ? "위험 확인됨" : "위험 없음" },
  ];

  const additional: ConditionCheck[] = [
    {
      label: "하단 밴드 이탈 후 내부 재진입",
      met: bollinger.recentReentry !== null && bollinger.recentReentry.reentryDate !== null,
      detail: bollinger.recentReentry ? `이탈일 ${bollinger.recentReentry.breachDate}${bollinger.recentReentry.reentryDate ? `, 재진입 ${bollinger.recentReentry.reentryDate}` : " (아직 재진입 안함)"}` : "최근 이탈 이력 없음",
    },
    { label: "반등형 가격 움직임", met: latest.close >= latest.lower, detail: `종가 ${latest.close.toLocaleString()} / 하단 ${Math.round(latest.lower).toLocaleString()}` },
    { label: "거래량 개선", met: volumeFlow.evaluation === "상승 지속 뒷받침" ? true : volumeFlow.evaluation === "관심 이탈" ? false : null, detail: volumeFlow.reasons.join("; ") },
    { label: "주도 섹터 강도 유지", met: sectorPositive, detail: `테마 강도: ${sector.strength}` },
    { label: "재료가 여전히 유효함", met: catalyst.valid, detail: catalyst.freshnessDays !== null ? `${catalyst.freshnessDays}일 전 기사` : "기사 없음" },
  ];

  const baseMetCount = base.filter((c) => c.met === true).length;
  const baseAll = base.every((c) => c.met === true);
  const additionalMetCount = additional.filter((c) => c.met === true).length;

  if (baseAll && additionalMetCount >= 3) {
    return { state: "조건부 진입 후보", conditions: [...base, ...additional], warnings };
  }
  if (baseMetCount >= 3 && near02 && sectorPositive !== false) {
    return { state: "매수 관심 구간", conditions: base, warnings };
  }

  // 하단 근접인데 관심 조건도 못 채우면 "반등 확인 필요" — 하락 지속 중이며
  // 반등 신호가 아직 없다는 뜻.
  const bounceConditions: ConditionCheck[] = [
    { label: "하단 밴드 부근에 있음", met: true, detail: `%B ${latest.percentB.toFixed(2)}` },
    { label: "하락 추세 지속", met: bollinger.slope === "하락", detail: `중심선 기울기: ${bollinger.slope ?? "판단불가"}(${bollinger.slopePct?.toFixed(1) ?? "N/A"}%)` },
    { label: "반등 캔들 미확인", met: latest.close < latest.lower, detail: `종가 ${latest.close.toLocaleString()} / 하단 ${Math.round(latest.lower).toLocaleString()}` },
    { label: "거래량이 반등을 뒷받침하지 않음", met: volumeFlow.evaluation !== "상승 지속 뒷받침", detail: volumeFlow.reasons.join("; ") },
    { label: "중심선 기울기가 강한 하락", met: bollinger.slopePct !== null ? bollinger.slopePct <= -3 : null, detail: bollinger.slopePct !== null ? `${bollinger.slopePct.toFixed(1)}%` : "데이터 부족" },
  ];
  return { state: "반등 확인 필요", conditions: [...base, ...bounceConditions], warnings };
}

function classifySell(input: PullbackInputs): { state: SellState; conditions: ConditionCheck[] } {
  const { bollinger, sector, volumeFlow } = input;
  const latest = bollinger.latest;

  if (latest === null || latest.percentB === null || latest.percentB < UPPER_NEAR_THRESHOLD) {
    return {
      state: "해당 없음(밴드 상단 근접 아님)",
      conditions: [{ label: "밴드 상단 근접(%B ≥ 0.8)", met: latest?.percentB !== null && latest?.percentB !== undefined ? latest.percentB >= UPPER_NEAR_THRESHOLD : null, detail: latest?.percentB !== null && latest?.percentB !== undefined ? `%B ${latest.percentB.toFixed(2)}` : "데이터 부족/예외" }],
    };
  }

  const sectorWeak = sector.strength === "약";
  const sectorStrong = SECTOR_OK.has(sector.strength);
  const volumeAbnormal = volumeFlow.evaluation === "고점 매물성 거래량 의심" || volumeFlow.evaluation === "관심 이탈";
  // 윗꼬리(고가 대비 종가 밀림)는 여기서 못 본다 — BollingerPoint는 종가만
  // 가지고 있어(밴드 자체가 종가 기준 지표라 당연함) 당일 고가·저가가 없다.
  // 호출부가 캔들을 직접 들고 있다면 Phase 3에서 이 신호를 추가로 넘길 수
  // 있다 — 지금은 "데이터 부족"으로 빼고 지어내지 않는다.

  const weakConditions: ConditionCheck[] = [
    { label: "상단 밴드 도달", met: true, detail: `%B ${latest.percentB.toFixed(2)}` },
    { label: "거래량 비정상(감소 또는 과도 확대)", met: volumeAbnormal, detail: volumeFlow.reasons.join("; ") },
    { label: "주도 섹터 강도 약화", met: sectorWeak, detail: `테마 강도: ${sector.strength}` },
    { label: "단기 상승 추세 약화", met: bollinger.slope !== "상승", detail: `중심선 기울기: ${bollinger.slope ?? "판단불가"}` },
  ];
  const strongConditions: ConditionCheck[] = [
    { label: "상단 밴드 부근에서 상승 지속", met: true, detail: `%B ${latest.percentB.toFixed(2)}` },
    { label: "중심선 상승 기울기 유지", met: bollinger.slope === "상승", detail: `${bollinger.slopePct?.toFixed(1) ?? "N/A"}%` },
    { label: "주도 섹터 강세 유지", met: sectorStrong, detail: `테마 강도: ${sector.strength}` },
    { label: "명확한 추세 훼손 신호 없음", met: !volumeAbnormal, detail: volumeFlow.reasons.join("; ") },
  ];
  const weakScore = weakConditions.filter((c) => c.met === true).length;
  const strongScore = strongConditions.filter((c) => c.met === true).length;

  if (strongScore >= 3 && weakScore <= 1) {
    return { state: "강한 상승 추세 / 추적 관리", conditions: strongConditions };
  }
  if (weakScore >= 2) {
    return { state: "분할 익절 검토", conditions: weakConditions };
  }
  return { state: "익절 관찰", conditions: weakConditions };
}

export function classifyPullback(input: PullbackInputs): PullbackAssessment {
  const buy = classifyBuy(input);
  const sell = classifySell(input);
  return {
    buyState: buy.state,
    buyConditions: buy.conditions,
    sellState: sell.state,
    sellConditions: sell.conditions,
    riskWarnings: buy.warnings,
  };
}
