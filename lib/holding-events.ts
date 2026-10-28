// 보유종목 알림 E단계(사용자 스펙 2026-10-27 10번) — 등급과 별개로 "지금 알아야 하는
// 사건"을 규칙으로 잡고, 같은 사건을 반복해서 보내지 않게 하고, 등급이 장중에 잠깐
// 흔들린 걸로 바로 알리지 않게(히스테리시스) 하는 판단. DB·네트워크 없는 순수 함수
// (tests/holding-events.test.ts). 조회·기록·발송은 lib/portfolio-alerts.ts.
//
// 사건 종류와 기준(전부 이미 가져온 KIS·DART 데이터로만):
//   긴급  거래정지 · 관리종목/투자위험 지정 · 긴급 공시(거래정지·상장폐지·감사의견·횡령배임·회생 등)
//   주의  투자경고/투자주의/단기과열 · 주의 공시(CB·BW·유상증자·감자·최대주주 변경·소송)
//         · 직전 20거래일 최저가 이탈 · 외국인·기관 동반 순매도 3거래일 이상
//         · 하락 중 거래량 급증 · 한 종목 비중 30% 이상 · 기록한 무효화 조건(가격·손실률) 도달
//   참고  실적·계약·자사주 공시 · 상승 중 거래량 급증 · 외국인·기관 동반 순매수 3거래일 이상
//         · 볼린저 하단 이탈 후 재진입
// 긴급 사건은 지연 없이 바로 보낸다. 손익률 자체는 사건으로 만들지 않는다(스펙 2-C) —
// 단, 사용자가 직접 "-30% 손실이면 판다"처럼 기록한 조건은 사용자 기준이라 알린다.

import { STATE_RANK, type AssessmentState, type HoldingAssessment } from "@/lib/holding-assessment";
import type { PriceSnapshot } from "@/lib/holding-price";
import type { HoldingDetail } from "@/lib/holding-detail";
import type { ClassifiedFiling } from "@/lib/holding-context";

export type EventSeverity = "긴급" | "주의" | "참고";
export const EVENT_SEVERITY_RANK: Record<EventSeverity, number> = { 참고: 0, 주의: 1, 긴급: 2 };

export type HoldingEventType =
  | "halt"
  | "market-warning"
  | "filing"
  | "low20-break"
  | "volume-spike"
  | "flow-joint"
  | "band-reentry"
  | "weight-high"
  | "thesis-price"
  | "thesis-loss";

export type HoldingEvent = {
  type: HoldingEventType;
  code: string;
  name: string;
  key: string; // 중복 판단 키(HoldingEventLog.eventKey)
  severity: EventSeverity;
  title: string; // 알림 한 줄
  persistent: boolean; // 상태형(해소될 때까지 한 번만) — 날짜·공시번호로 키가 매번 다른 일회성과 구분
};

export const WEIGHT_TRIGGER_PCT = 30;
export const WEIGHT_CLEAR_PCT = 25; // 30%에서 알리고 25% 아래로 내려가야 "해소" — 경계에서 왔다갔다하며 반복 알림 방지
export const VOLUME_SPIKE_PCT = 200; // 20일 평균 하루 거래량의 2배
export const FLOW_JOINT_MIN_DAYS = 3;
const THESIS_CLEAR_BUFFER = 0.02; // 조건 가격보다 2% 넘게 회복해야 해소

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const pct = (n: number, d = 1) => `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;
const mmdd = (ymd: string) => (ymd.length === 10 ? `${ymd.slice(5, 7)}/${ymd.slice(8)}` : ymd.length === 8 ? `${ymd.slice(4, 6)}/${ymd.slice(6)}` : ymd);

// 사용자가 적은 무효화 조건에서 숫자 조건만 뽑는다 — "8,000원 깨지면", "-30% 손실이면".
// 못 뽑으면 null(문장 해석을 지어내지 않는다).
export function parseThesisConditions(text: string | null): { priceBelow: number | null; lossPct: number | null } {
  if (!text) return { priceBelow: null, lossPct: null };
  const price = /(\d{1,3}(?:,\d{3})+|\d+)\s*원\s*(?:이하|아래|밑|미만|깨|이탈|무너|하회)/.exec(text);
  const loss = /(\d+(?:\.\d+)?)\s*%\s*(?:이상\s*)?(?:손실|하락|빠지|떨어지)/.exec(text);
  return {
    priceBelow: price ? Number(price[1].replace(/,/g, "")) : null,
    lossPct: loss ? Number(loss[1]) : null,
  };
}

export type DetectInput = {
  date: string; // KST YYYY-MM-DD
  assessment: HoldingAssessment;
  price: PriceSnapshot | null;
  detail: HoldingDetail | null;
  filings: ClassifiedFiling[] | null; // 오늘·전 거래일 중요 공시. null = 조회 실패(해소 판단도 안 함)
  thesisInvalidation: string | null;
};

// clearPrefixes: 이번에 "조건을 실제로 확인했고 지금은 아니다"라고 말할 수 있는 상태형
// 사건의 키 앞부분 — 해당 키 중 지금 활성이 아닌 것만 해소 처리된다(데이터를 못 받았으면
// 넣지 않는다 → 모르는 걸 해소로 처리하지 않음).
export function detectHoldingEvents(input: DetectInput): { events: HoldingEvent[]; clearPrefixes: string[] } {
  const a = input.assessment;
  const p = input.price;
  const { code, name } = a;
  const events: HoldingEvent[] = [];
  const clearPrefixes: string[] = [];
  const ev = (type: HoldingEventType, key: string, severity: EventSeverity, title: string, persistent: boolean) =>
    events.push({ type, code, name, key, severity, title, persistent });

  if (p) {
    if (p.tradingHalted) ev("halt", `halt:${code}`, "긴급", "⛔ 거래정지 상태예요(KIS 시세 기준)", true);
    clearPrefixes.push(`halt:${code}`);
    if (p.statusLabel && p.statusLabel !== "거래정지") {
      const sev: EventSeverity = p.statusLabel === "관리종목" || p.statusLabel === "투자위험" ? "긴급" : "주의";
      ev("market-warning", `market-warning:${code}:${p.statusLabel}`, sev, `${p.statusLabel} 지정 상태예요(KIS 종목 상태)`, true);
    }
    clearPrefixes.push(`market-warning:${code}:`);
  }

  for (const f of input.filings ?? []) {
    ev("filing", `filing:${f.rceptNo}`, f.severity, `${mmdd(f.reportDate)} 공시 [${f.category}] ${f.reportName.replace(/\s+/g, " ")}`, false);
  }

  const chart = input.detail?.chart ?? null;
  if (p && chart?.prior20Low && p.price < chart.prior20Low.price) {
    ev(
      "low20-break",
      `low20-break:${code}:${input.date}`,
      "주의",
      `직전 20거래일 최저가 ${won(chart.prior20Low.price)}(${mmdd(chart.prior20Low.date)}) 아래로 내려왔어요 — 지금 ${won(p.price)}${p.session === "장중" ? ", 장중 기준(종가 확정 전)" : ""}`,
      false
    );
  }

  const b = chart?.bollinger;
  if (chart && b?.reentry?.reentryDate === chart.asOfDate) {
    ev(
      "band-reentry",
      `band-reentry:${code}:${chart.asOfDate}`,
      "참고",
      `볼린저 하단 이탈(${mmdd(b.reentry.breachDate)}) 후 다시 밴드 안으로 들어왔어요${p?.session === "장중" ? " — 장중 기준" : ""}`,
      false
    );
  }

  const v = input.detail?.volume ?? null;
  if (v) {
    // 장중엔 "벌써 하루 평균의 2배"일 때만 — 덜 찬 누적치로 많다고 판단하는 건 방향상 안전하다
    // (적다고 판단하는 건 하지 않는다. lib/holding-detail.ts computeVolumeDetail 주석).
    const spikePct = v.partial ? v.progressPct : v.vsAvg20Pct !== null ? v.vsAvg20Pct + 100 : null;
    if (spikePct !== null && spikePct >= VOLUME_SPIKE_PCT) {
      const down = (p?.changePct ?? 0) < 0;
      ev(
        "volume-spike",
        `volume-spike:${code}:${v.latestDate}`,
        down ? "주의" : "참고",
        v.partial
          ? `장중 누적 거래량이 벌써 20일 평균 하루치의 ${spikePct.toFixed(0)}%예요${p?.changePct != null ? `(오늘 ${pct(p.changePct, 2)})` : ""}`
          : `${mmdd(v.latestDate)} 거래량이 직전 20거래일 평균의 ${spikePct.toFixed(0)}%였어요${p?.changePct != null ? `(${pct(p.changePct, 2)})` : ""}`,
        false
      );
    }
  }

  const joint = input.detail?.flow.joint ?? null;
  if (joint && joint.days >= FLOW_JOINT_MIN_DAYS) {
    ev(
      "flow-joint",
      `flow-joint:${code}:${joint.direction}:${joint.startDate}`,
      joint.direction === "동반 순매도" ? "주의" : "참고",
      `외국인·기관 ${joint.direction} ${joint.days}거래일째(${mmdd(joint.startDate)}~${mmdd(joint.endDate)} 집계)`,
      false
    );
  }

  if (a.weightPct !== null) {
    if (a.weightPct >= WEIGHT_TRIGGER_PCT) {
      ev("weight-high", `weight-high:${code}`, "주의", `한 종목 비중이 전체 자산의 ${a.weightPct.toFixed(1)}%예요(${WEIGHT_TRIGGER_PCT}% 이상)`, true);
    } else if (a.weightPct < WEIGHT_CLEAR_PCT) {
      clearPrefixes.push(`weight-high:${code}`);
    }
  }

  const cond = parseThesisConditions(input.thesisInvalidation);
  if (cond.priceBelow !== null && p) {
    const key = `thesis-price:${code}:${cond.priceBelow}`;
    if (p.price <= cond.priceBelow) {
      ev("thesis-price", key, "주의", `기록한 무효화 조건 "${input.thesisInvalidation}"의 가격(${won(cond.priceBelow)})에 닿았어요 — 지금 ${won(p.price)}`, true);
    } else if (p.price > cond.priceBelow * (1 + THESIS_CLEAR_BUFFER)) {
      clearPrefixes.push(key);
    }
  }
  if (cond.lossPct !== null && a.changePct !== null) {
    const key = `thesis-loss:${code}:${cond.lossPct}`;
    if (a.changePct <= -cond.lossPct) {
      ev("thesis-loss", key, "주의", `기록한 무효화 조건 "${input.thesisInvalidation}"의 손실률(-${cond.lossPct}%)에 닿았어요 — 지금 ${pct(a.changePct)}`, true);
    } else if (a.changePct > -cond.lossPct + 2) {
      clearPrefixes.push(key);
    }
  }

  return { events, clearPrefixes };
}

export type EventLogRow = { eventKey: string; severity: string; sentAt: Date | null; resolvedAt: Date | null };

// 같은 사건 반복 방지:
//   - 처음 보는 사건 → 보냄
//   - 이미 보냈고 아직 해소 안 됨 → 안 보냄(심각도가 올라갔을 때만 다시)
//   - 해소됐다가 다시 생김 → 다시 보냄
//   - 보내려다 실패해서 sentAt이 없음 → 다시 보냄
// seedOnly(이 사용자의 사건 기록이 아직 하나도 없는 첫 실행): 원래부터 이어지던 상태형 주의
// 사건(예: 이미 비중 52%)은 "새로 생긴 일"이 아니라 조용히 기록만 한다. 긴급은 그래도 보낸다.
export function planEventDelivery(p: {
  events: HoldingEvent[];
  clearPrefixes: string[];
  logs: EventLogRow[];
  seedOnly: boolean;
}): { send: HoldingEvent[]; seed: HoldingEvent[]; resolveKeys: string[] } {
  const byKey = new Map(p.logs.map((l) => [l.eventKey, l]));
  const send: HoldingEvent[] = [];
  const seed: HoldingEvent[] = [];
  for (const e of p.events) {
    const log = byKey.get(e.key);
    if (!log) {
      if (p.seedOnly && e.persistent && e.severity !== "긴급") seed.push(e);
      else send.push(e);
    } else if (log.resolvedAt || !log.sentAt) {
      send.push(e);
    } else if (EVENT_SEVERITY_RANK[e.severity] > (EVENT_SEVERITY_RANK[log.severity as EventSeverity] ?? 0)) {
      send.push(e);
    }
  }
  const active = new Set(p.events.map((e) => e.key));
  const resolveKeys = p.logs
    .filter((l) => !l.resolvedAt && !active.has(l.eventKey) && p.clearPrefixes.some((prefix) => l.eventKey.startsWith(prefix)))
    .map((l) => l.eventKey);
  return { send: sortEvents(send), seed, resolveKeys };
}

export function sortEvents(events: HoldingEvent[]): HoldingEvent[] {
  return [...events].sort((a, b) => EVENT_SEVERITY_RANK[b.severity] - EVENT_SEVERITY_RANK[a.severity]);
}

// ---------------------------------------------------------------- 등급 히스테리시스

// 등급 판정의 차트 신호(현재가가 20일선·60일선 위냐 아래냐)는 장중 가격이 이평 근처에서
// 오르내리면 정시마다 뒤집힐 수 있다. 그래서 "나빠졌다"를 처음 본 실행엔 보류하고, 바로
// 다음 실행에도 그대로면 보낸다. 등급 규칙 자체는 바꾸지 않는다(보내는 시점만).
// 바로 보내는 경우: 한 번에 2단계 이상 악화, 같은 종목에 긴급 사건, 그날 마지막 정시(15시 —
// 다음 확인 기회가 없다).
//
// "바로 다음 실행"을 시간 간격으로 재면 안 된다 — Vercel Hobby 크론은 정시가 아니라 슬롯마다
// 정해진 분에 돈다(실측 2026-10-16~10-28: 09:25·10:50·12:35·13:20·14:54·15:54, 간격 45~94분).
// 그래서 매 실행마다 더 이상 나쁘지 않은 종목의 보류 기록을 해소하고(stalePendingKeys),
// 해소 안 된 보류 기록 = 직전 실행에서도 봤다는 뜻으로 쓴다. 시간 상한은 실행이 한 번
// 통째로 빠졌을 때만 걸리는 안전장치.
export const GRADE_CONFIRM_MIN_MS = 30 * 60 * 1000; // 처음 본 지 30분 이상 지났고
export const GRADE_CONSECUTIVE_MAX_MS = 150 * 60 * 1000; // 마지막으로 본 지 2시간 30분 이내

// pending: 해소 안 된 보류 기록만 넘긴다(해소된 건 null — 연속이 끊김).
export type GradePending = { firstSeenAt: Date; lastSeenAt: Date };

// 이번 실행에서 보류·발송 후보가 아닌 등급 보류 기록(좋아졌거나 이미 보냈거나 지난 날짜) —
// 해소 처리해서 다음에 다시 나빠지면 처음부터 다시 재게 한다.
export function stalePendingKeys(logs: { eventKey: string; resolvedAt: Date | null }[], activeKeys: Set<string>): string[] {
  return logs.filter((l) => l.eventKey.startsWith("grade-pending:") && !l.resolvedAt && !activeKeys.has(l.eventKey)).map((l) => l.eventKey);
}

export function decideGradeDelivery(p: {
  state: AssessmentState;
  previousState: AssessmentState | null;
  pending: GradePending | null;
  now: Date;
  lastRunOfDay: boolean;
  hasUrgentEvent: boolean;
}): { action: "send" | "hold"; resetPending: boolean } {
  const consecutive = p.pending !== null && p.now.getTime() - p.pending.lastSeenAt.getTime() <= GRADE_CONSECUTIVE_MAX_MS;
  const steps = p.previousState ? STATE_RANK[p.state] - STATE_RANK[p.previousState] : 0;
  if (p.lastRunOfDay || p.hasUrgentEvent || steps >= 2) return { action: "send", resetPending: false };
  if (consecutive && p.now.getTime() - p.pending!.firstSeenAt.getTime() >= GRADE_CONFIRM_MIN_MS) return { action: "send", resetPending: false };
  // 처음 봤거나, 중간에 한 번 좋아졌다가 다시 나빠졌으면(연속이 끊김) 처음부터 다시 잰다
  return { action: "hold", resetPending: !consecutive };
}

export function gradePendingKey(code: string, date: string, state: AssessmentState): string {
  return `grade-pending:${code}:${date}:${state}`;
}
