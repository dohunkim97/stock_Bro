import { getLatestPrediction, parsePredictionCandidates } from "@/lib/prediction-scoring";
import { formatDateLabel } from "@/lib/dates";
import { getCandidateDetails, parseStoredCandidateDetails } from "@/lib/candidate-detail";
import { fetchKisChart } from "@/lib/kis-chart";
import { computeTechnicalSignals, LONG_TERM_SIGNAL_CANDLES } from "@/lib/technical-signals";
import { DetailCard } from "./detail-card";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
  height: "100%",
  overflowY: "auto",
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

// 오늘 Golgoo 예상 리포트 — 요약/주목 섹터 없이 예상 종목(DetailCard) 카드만
// 보여준다(사용자 요청: 내용/주목 섹터는 빼고 예상 종목에 집중). 각 카드의
// 7항목(사업요약/시황/거래량/차트/재료/수급/재무)을 클릭하면
// components/bro/field-detail-modal.tsx가 그 항목 하나만 전문 분석가 수준으로
// 파고드는 모달을 연다. 기록보관소(ArchiveHub의 예상리포트 탭, 지난 날들의
// 채점 결과)와는 별개로 "오늘" 예측 한 건만 보여준다.
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

  return (
    <section style={panelStyle}>
      <div style={sectionTitleStyle}>📝 Golgoo 예상 리포트 · {formatDateLabel(latest.forDate)} (5거래일 추적)</div>

      {candidates.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {details.map((d) => (
            <DetailCard key={d.name} d={d} signals={signalsByName.get(d.name)} />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--faint)" }}>오늘 예상 종목이 아직 없어요.</div>
      )}
    </section>
  );
}
