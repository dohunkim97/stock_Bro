// "보유 이유가 아직 유효해?", "긴급 점검", "시나리오", "오늘 보유종목 뉴스"
// 같은 깊은 질문들의 데이터 수집 쪽 — lib/golgoo-chat.ts가 키워드로 감지해
// 호출하고, 여기서 모은 사실(코드가 계산/조회한 것만)을 시스템 프롬프트
// 블록으로 만들어 넘기면 LLM은 그 안에서만 판단한다(새 숫자를 안 만들게).
// lib/holding-assessment-store.ts가 이미 계산해둔 AssessmentReport를
// 받아 쓰므로(또 KIS를 부르지 않음) 여기서는 그 위에 "왜 샀는지"(thesis)와
// DART 공시·뉴스만 추가로 가져온다.

import { getThesis } from "@/lib/holding-thesis";
import { getCorpCode, fetchRecentDilutionFilings } from "@/lib/dart";
import { fetchKisNewsForCodes, type KisNewsItem } from "@/lib/kis-news";
import { todayISO, nowSeoulTimeLabel } from "@/lib/dates";
import { SIGNAL_SOURCE_LABEL, holdingPeriodLabel, type HoldingAssessment } from "@/lib/holding-assessment";
import type { AssessmentReport } from "@/lib/holding-assessment-store";

function findHeldMatch(report: AssessmentReport, text: string): HoldingAssessment | null {
  // 이름이 2글자 이상 겹치는 보유 종목을 찾는다 — 정확한 종목코드 매칭
  // (findMentionedStocks)과 달리 여기선 "이미 보유 중인 것"으로 범위가
  // 좁아서(많아야 수십 개) 이 정도 느슨한 포함 매칭으로 충분하다.
  return report.assessments.find((a) => a.name.length >= 2 && text.includes(a.name)) ?? null;
}

// module ③ 보유종목 전담 분석관 — "LG에너지솔루션 보유 이유가 아직 유효해?"
export async function buildHoldingDeepDiveBlock(userId: string, text: string, report: AssessmentReport): Promise<string> {
  const held = findHeldMatch(report, text);
  if (!held) return "";

  const [thesis, corpCode] = await Promise.all([getThesis(userId, held.code), getCorpCode(held.code)]);
  const dilutions = corpCode ? await fetchRecentDilutionFilings(corpCode, Date.now() + 15000) : [];

  const lines = [
    `\n\n[보유종목 전담 분석 — ${held.name}, 데이터 기준 ${report.asOf}]`,
    `지금 판정: ${held.state} (${held.stateNote})`,
    `신호: ${held.signals.map((s) => `${s.label}=${s.score ?? "데이터없음"}(${SIGNAL_SOURCE_LABEL[s.key]}): ${s.note}`).join(" / ")}`,
    `손익 ${held.changePct !== null ? held.changePct.toFixed(1) + "%" : "-"}, 비중 ${held.weightPct !== null ? held.weightPct.toFixed(1) + "%" : "-"}, 보유기간 ${held.holdingDays !== null ? holdingPeriodLabel(held.holdingDays) : "미입력"}`,
  ];

  if (thesis) {
    lines.push(`매수 당시 투자 논리(사용자가 직접 말해준 것): "${thesis.reason}"`);
    if (thesis.invalidation) lines.push(`무효화 조건(사용자가 정한 것): "${thesis.invalidation}"`);
  } else {
    lines.push(`매수 당시 투자 논리: 기록된 게 없음 — 답변 끝에 "왜 샀는지 말해주면 다음부턴 그거랑 비교해줄게"라고 자연스럽게 물어봐.`);
  }

  if (dilutions.length > 0) {
    lines.push(
      `⚠️ 최근 ${dilutions.length}건의 희석 가능 공시(CB/BW/유상증자 키워드 제목 매칭 — 상환/취소일 수도 있어 원문 확인 필요):`,
      ...dilutions.map((d) => `- ${d.reportDate}: ${d.reportName}`)
    );
  } else {
    lines.push(`최근 희석 관련(CB/BW/유상증자) 공시: 없음(최근 120일, 제목 키워드 기준)`);
  }

  const news = await fetchKisNewsForCodes([held.code]).catch(() => []);
  if (news.length > 0) {
    lines.push("최근 뉴스:", ...news.slice(0, 5).map((n) => `- ${n.date.slice(4, 6)}/${n.date.slice(6, 8)} ${n.title}${n.source ? ` (${n.source})` : ""}`));
  }

  lines.push(
    "위 사실만 근거로 '보유 이유가 아직 유효한지'를 유지/약화/무효 중 하나로 냉정하게 판단해 — 손실률만 보고 판단하지 말고, 투자 논리가 있으면 그게 지금 신호와 맞는지 대조해. 근거 없는 추측은 하지 마."
  );
  return lines.join("\n");
}

// module ④ 리스크 감시관 — "내 계좌에서 지금 가장 위험한 문제 3개만 찾아"
export async function buildRiskTopBlock(report: AssessmentReport): Promise<string> {
  if (report.assessments.length === 0) return "";
  const top = report.assessments.slice(0, 5); // sortByPriority로 이미 위험한 순

  const dilutionChecks = await Promise.all(
    top.slice(0, 3).map(async (a) => {
      const corpCode = await getCorpCode(a.code).catch(() => null);
      const filings = corpCode ? await fetchRecentDilutionFilings(corpCode, Date.now() + 10000, 60) : [];
      return { code: a.code, filings };
    })
  );

  const lines = [
    `\n\n[리스크 감시 — 아래가 코드가 계산한 "위험한 순" 전부야, 여기 없는 위험은 지어내지 마. 데이터 기준 ${report.asOf}]`,
  ];
  for (const a of top) {
    const dilution = dilutionChecks.find((d) => d.code === a.code);
    const dilutionNote = dilution && dilution.filings.length > 0 ? ` · ⚠️ 최근 희석 공시 ${dilution.filings.length}건(${dilution.filings[0].reportDate} ${dilution.filings[0].reportName})` : "";
    lines.push(
      `- ${a.name}: ${a.state} (${a.stateNote}), 손익 ${a.changePct !== null ? a.changePct.toFixed(1) + "%" : "-"}, 비중 ${a.weightPct !== null ? a.weightPct.toFixed(1) + "%" : "-"}${dilutionNote}`
    );
  }
  if (report.flags.length > 0) {
    lines.push("포트폴리오 전체 경고:", ...report.flags.map((f) => `- ${f.text}`));
  }
  lines.push(
    "⚠️ 참고: 거래정지/관리종목/감사의견 같은 시장조치는 아직 이 데이터에 없어 — 확인 안 됨이라고만 말하고 지어내지 마."
  );
  lines.push("위 목록 중에서만 가장 심각한 3개를 골라 순서대로 짧게 설명해. 목록에 없는 종목/위험을 새로 만들지 마.");
  return lines.join("\n");
}

// module ⑤ 시나리오 예측관 — "이 종목이 5거래일 동안 상승·횡보·하락할 조건을 분석해"
// 확률은 절대 안 쓴다(검증 안 된 숫자라 — "데이터 부족" 원칙 그대로). 대신
// 지금 기술적 위치(이동평균·52주 고점 대비·거래량)에서 "이러면 상승 쪽,
// 이러면 하락 쪽"이라는 조건문과, 그 조건이 깨지는 지점(무효화 조건)만 준다.
export function buildScenarioBlock(text: string, report: AssessmentReport): string {
  const held = findHeldMatch(report, text);
  if (!held) return "";
  const t = held.tech;
  const daysMatch = text.match(/(\d+)\s*(거래일|일)/);
  const horizon = daysMatch ? `${daysMatch[1]}거래일` : "5거래일";

  const lines = [
    `\n\n[시나리오 분석 재료 — ${held.name}, ${horizon} 전망 요청, 데이터 기준 ${report.asOf}. 확률(%)은 검증된 적중률이 없으니 절대 쓰지 말고, 아래 조건문 형태로만 답해]`,
    `현재가 ${held.currentPrice.toLocaleString()}원, 20일선 ${t.ma20?.toLocaleString() ?? "-"}, 60일선 ${t.ma60?.toLocaleString() ?? "-"}, 52주 고점 대비 ${t.fromHigh52w !== null ? t.fromHigh52w.toFixed(1) + "%" : "-"}, 최근5일/직전20일 거래량 비율 ${t.volumeRatio !== null ? t.volumeRatio.toFixed(2) : "-"}, 최근 1개월 수익률 ${t.ret1m !== null ? t.ret1m.toFixed(1) + "%" : "-"}`,
    `신호 요약: ${held.stateNote}`,
    "이 숫자들만 근거로 상승/기본(횡보)/하락 세 조건을 만들어줘 — 각각 '어떤 조건이 충족되면'(예: 거래량 동반 20일선 돌파) + '그 조건이 깨지면 판단을 철회할 무효화 조건' 형태로. 목표가/손절가를 말할 거면 어떤 가격·지표에서 산출했는지 근거를 같이 밝혀. 확률·적중 가능성 수치는 쓰지 마(검증된 데이터 없음).",
  ];
  return lines.join("\n");
}

// module ⑦ 뉴스·공시 정보관 — "오늘 내 보유종목에 영향을 주는 공시와 뉴스만"
export async function buildNewsImpactBlock(report: AssessmentReport): Promise<string> {
  if (report.assessments.length === 0) return "";
  const codes = report.assessments.map((a) => a.code);
  const allNews = await fetchKisNewsForCodes(codes).catch(() => [] as KisNewsItem[]);
  const today = todayISO().replaceAll("-", "");
  const todayNews = allNews.filter((n) => n.date === today);

  const lines = [`\n\n[오늘(${todayISO()}) 보유종목 뉴스 — 기준 시각 ${nowSeoulTimeLabel()}]`];
  if (todayNews.length === 0) {
    lines.push("오늘 들어온 보유종목 관련 뉴스 없음(KIS 뉴스 제목 기준 — 전부는 아닐 수 있음).");
  } else {
    for (const n of todayNews) {
      lines.push(`- [${n.stockName ?? "?"}] ${n.time.slice(0, 2)}:${n.time.slice(2, 4)} ${n.title}${n.source ? ` (${n.source})` : ""}`);
    }
    lines.push(
      "각 뉴스가 그 종목 보유 논리에 호재/악재/중립인지, 이미 알려진 재료인지 짧게 판단해줘 — 위 목록에 없는 뉴스는 지어내지 마."
    );
  }
  return lines.join("\n");
}
