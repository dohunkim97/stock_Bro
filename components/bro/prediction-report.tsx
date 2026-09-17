import { getLatestPrediction, parsePredictionCandidates } from "@/lib/prediction-scoring";
import { formatDateLabel } from "@/lib/dates";
import { getCandidateDetails, parseStoredCandidateDetails } from "@/lib/candidate-detail";
import { fetchKisChart } from "@/lib/kis-chart";
import { computeTechnicalSignals, LONG_TERM_SIGNAL_CANDLES } from "@/lib/technical-signals";
import { GolgooWorkspace } from "./golgoo-workspace";
import type { CardPayload } from "./stock-report-card";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
  height: "100%",
  overflow: "hidden",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--accent)",
  fontFamily: "var(--mono)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: 14,
};

// 골구 실시간 AI 트레이딩 워크스페이스의 진입점 — 오늘의 공식 예상 종목
// (getCandidateDetails, 5거래일 추적 대상)을 서버에서 미리 계산해 좌측
// 피드의 시작 카드로 넘기고, 실제 좌(60%)/우(40%) 레이아웃과 "대화로 카드가
// 늘어나는" 로직은 클라이언트 컴포넌트인 GolgooWorkspace가 맡는다
// (components/bro/golgoo-workspace.tsx). 기록보관소(ArchiveHub의 예상리포트
// 탭, 지난 날들의 채점 결과)와는 별개로 "오늘" 예측만 초기 카드로 보여준다.
export async function PredictionReport() {
  const latest = await getLatestPrediction();
  if (!latest) {
    return (
      <section style={panelStyle}>
        <div style={sectionTitleStyle}>📝 Golgoo 예상 리포트</div>
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>
          아직 생성된 다음 주 예측이 없어요. 평일 장마감 후 자동으로 생성돼요.
        </div>
      </section>
    );
  }

  const candidates = parsePredictionCandidates(latest.candidates);
  // 종목 근거는 생성 시점에 딱 한 번 계산해 저장해둔 값을 그대로 쓴다 —
  // 매번 실시간 시세/수급/재무/LLM을 다시 불러서 값이 나타났다 사라졌다
  // 바뀌지 않게 하기 위함(lib/weekly-prediction.ts가 저장). 저장된 값이
  // 없는 옛 레코드(마이그레이션 이전)만 그때 즉석에서 계산한다.
  // 기술적 시그널(CandidateTracker와 동일)은 순수 차트 계산이라 라이브로 유지.
  const stored = parseStoredCandidateDetails(latest.details);
  const [details, candles] = await Promise.all([
    stored ?? (candidates.length > 0 ? getCandidateDetails(candidates, latest.forDate) : Promise.resolve([])),
    Promise.all(candidates.map((c) => (c.code ? fetchKisChart(c.code, "D", LONG_TERM_SIGNAL_CANDLES) : Promise.resolve([])))),
  ]);
  const signalsByName = new Map(candidates.map((c, i) => [c.name, computeTechnicalSignals(candles[i])]));

  // 기업분석(BM/지배구조)은 DART 왕복이 느려서(최대 수십 초) 카드 목록
  // 자체를 늦추지 않도록 여기서는 안 불러온다 — StockReportCard가 마운트된
  // 뒤 각자 알아서 지연 로딩한다(components/bro/stock-report-card.tsx).
  const initialCards: CardPayload[] = details.map((d) => ({
    detail: d,
    business: null,
    signals: signalsByName.get(d.name),
  }));

  return (
    <section style={panelStyle}>
      <GolgooWorkspace
        initialCards={initialCards}
        headerTitle={`📝 Golgoo 예상 리포트 · ${formatDateLabel(latest.forDate)} (5거래일 추적)`}
      />
    </section>
  );
}
