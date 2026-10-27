// 보유종목 텔레그램 알림의 "보낼지 말지" 규칙과 문장 조립 — DB·네트워크 없는
// 순수 함수만 둬서 tests/holding-alerts.test.ts로 바로 검증한다. 실제 조회·
// 발송·기록은 lib/portfolio-alerts.ts가 한다. LLM은 쓰지 않는다(등급·숫자는
// 이미 규칙이 정했고, 문장도 그 값을 그대로 옮기기만 한다).

import { STATE_ICON, STATE_RANK, type AssessmentState, type HoldingAssessment } from "@/lib/holding-assessment";
import type { PriceSnapshot } from "@/lib/holding-price";
import type { MarketSession } from "@/lib/dates";

export type AlertKind = "worsened" | "new-risky";

// previousState: 바로 전 기록일의 등급(없으면 처음 진단된 종목).
// alreadyAlertedState: 오늘 이미 이 종목으로 보낸 알림의 등급.
// 규칙: 어제보다 나빠졌을 때만, 그리고 오늘 이미 보낸 것보다 더 나빠졌을 때만
// 보낸다 — 같은 등급이 이어지거나, 장중에 오르내리다 이미 알린 등급으로
// 돌아온 경우는 새 경고가 아니다.
export function decideAlert(p: {
  state: AssessmentState;
  previousState: AssessmentState | null;
  alreadyAlertedState: AssessmentState | null;
}): AlertKind | null {
  const rank = STATE_RANK[p.state];
  if (p.alreadyAlertedState !== null && rank <= STATE_RANK[p.alreadyAlertedState]) return null;
  if (p.previousState === null) return rank >= STATE_RANK["축소검토"] ? "new-risky" : null;
  return rank > STATE_RANK[p.previousState] ? "worsened" : null;
}

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const signedWon = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.round(Math.abs(n)).toLocaleString("ko-KR")}원`;
const signedPct = (n: number, digits: number) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

// 오늘 등락(전일 종가 대비)과 내 손익(평단 대비)을 같은 줄에 두되 라벨로 확실히
// 가른다 — "오늘 +3%"인데 "내 손익 -40%"일 수 있다는 걸 한눈에 보이게.
export function formatPriceLine(a: HoldingAssessment, snap: PriceSnapshot | undefined): string {
  const parts: string[] = [];
  if (snap?.tradingHalted) parts.push("⛔거래정지");

  if (!snap) {
    parts.push("시세 조회 실패 — 가격 정보 없음");
  } else {
    const today =
      snap.changePct === null
        ? "오늘 등락 확인 불가"
        : snap.changeAmount === null
          ? `오늘 ${signedPct(snap.changePct, 2)}`
          : `오늘 ${signedWon(snap.changeAmount)}(${signedPct(snap.changePct, 2)})`;
    parts.push(snap.live ? `${snap.priceLabel} ${won(snap.price)}` : `최근 일봉 ${won(snap.price)}(${snap.asOf}, 실시간 시세 조회 실패)`);
    parts.push(today);
  }

  if (a.changePct !== null) {
    const profit = (a.currentPrice - a.avgBuyPrice) * a.quantity;
    parts.push(`내 손익 ${signedPct(a.changePct, 1)}(${signedWon(profit)})`);
  }
  if (snap?.statusLabel && !(snap.tradingHalted && snap.statusLabel === "거래정지")) parts.push(`⚠️${snap.statusLabel}`);
  return parts.join(" · ");
}

// 등급이 바뀐 핵심 원인 1~3개. 어제와 비교해 점수가 바뀐 신호(변화 폭 큰 순)가
// 있으면 그걸, 처음 진단된 종목이거나 바뀐 신호가 안 잡히면 지금 음수인 신호를
// 약한 순으로.
export function pickReasons(a: HoldingAssessment, changed: string[]): string[] {
  const reasons =
    changed.length > 0
      ? changed
      : a.signals
          .filter((s) => s.score !== null && s.score < 0)
          .sort((x, y) => (x.score as number) - (y.score as number))
          .map((s) => `${s.label}: ${s.note}`);
  return reasons.slice(0, 3);
}

// 깊은 손실 경고 — 등급에는 반영하지 않고(lib/holding-assessment.ts stateFromSignals
// 주석) 따로 한 줄로 보여준다. -50%부터는 원금 회복에 +100% 이상이 필요해서
// 같은 등급이라도 대응 여지가 다르다는 걸 알려주는 용도.
export const DEEP_LOSS_PCT = -50;

export function deepLossLine(a: HoldingAssessment): string | null {
  if (a.changePct === null || a.changePct > DEEP_LOSS_PCT || a.recoveryNeededPct === null) return null;
  return `⚠️ 손실 ${signedPct(a.changePct, 1)} — 원금 회복까지 +${a.recoveryNeededPct.toFixed(1)}% 필요(등급과 별개)`;
}

export function formatStockAlert(p: {
  kind: AlertKind;
  assessment: HoldingAssessment;
  price: PriceSnapshot | undefined;
  previousState: AssessmentState | null;
  changedReasons: string[];
}): string {
  const a = p.assessment;
  const to = `**${STATE_ICON[a.state]}${a.state}**`;
  let head: string;
  if (p.kind === "new-risky" || p.previousState === null) {
    head = `**${a.name}**(${a.code}) 신규 진단 → ${to}`;
  } else {
    const steps = STATE_RANK[a.state] - STATE_RANK[p.previousState];
    head = `**${a.name}**(${a.code}) ${STATE_ICON[p.previousState]}${p.previousState} → ${to} (위험 ${steps}단계 상승)`;
  }
  const reasons = pickReasons(a, p.changedReasons);
  const lines = [head, formatPriceLine(a, p.price)];
  lines.push(reasons.length > 0 ? `원인: ${reasons.join(" / ")}` : `원인: ${a.stateNote}`);
  const deep = deepLossLine(a);
  if (deep) lines.push(deep);
  return lines.join("\n");
}

export type ImprovedHolding = { name: string; from: AssessmentState; to: AssessmentState };

export function formatAlertMessage(p: {
  asOf: string;
  session: MarketSession;
  analyzedCount: number;
  stockBlocks: { name: string; kind: AlertKind; text: string }[];
  improved: ImprovedHolding[];
  hasButtons?: boolean; // 종목별 상세 버튼이 붙는지(알림 기록 저장에 실패하면 버튼 없이 나간다)
}): string {
  const worsened = p.stockBlocks.filter((b) => b.kind === "worsened").length;
  const newRisky = p.stockBlocks.length - worsened;
  const counts = [`위험 상승 ${worsened}`, ...(newRisky > 0 ? [`신규 진단 위험 ${newRisky}`] : []), `위험 감소 ${p.improved.length}`];

  const lines = [
    `⚠️ 둥지 알림 · ${p.asOf} 기준(${p.session})`,
    `보유 ${p.analyzedCount}종목 분석 — ${counts.join(" · ")}`,
  ];
  if (p.stockBlocks.length > 0) lines.push(`우선 확인: **${p.stockBlocks[0].name}**`);
  lines.push("", p.stockBlocks.map((b) => b.text).join("\n\n"));
  if (p.improved.length > 0) {
    lines.push("", `위험 감소: ${p.improved.map((i) => `${i.name}(${STATE_ICON[i.from]}→${STATE_ICON[i.to]}${i.to})`).join(", ")}`);
  }
  lines.push(
    "",
    "※ 등급은 차트·수급·거래량·재무 신호로 정해서 지금 수익/손실과는 별개야 — 수익 중이어도 신호가 꺾이면 올라가.",
    "※ 시세: KIS · 손익: 둥지에 입력한 평단·수량 기준(세금·수수료 미반영)",
    "",
    p.hasButtons
      ? "아래 버튼으로 종목별 차트·보유정보·뉴스·대응 시나리오를 볼 수 있어. 더 물어봐도 돼."
      : "더 자세히 물어봐도 돼, 아니면 둥지에서 확인해줘."
  );
  return lines.join("\n");
}
