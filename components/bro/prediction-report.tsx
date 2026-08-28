import { getLatestPrediction, parsePredictionCandidates, parsePredictionSectors } from "@/lib/prediction-scoring";
import { formatDateLabel } from "@/lib/dates";
import { renderBold } from "@/components/ui/rich-text";
import { getCandidateDetails } from "@/lib/candidate-detail";
import { blockStyle, blockHeaderStyle, badgeStyle, blockLabelStyle, DetailCard } from "./detail-card";

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

// 이번 주 Golgoo 예상 리포트 — CandidateTracker(4번, 예상종목 라이브 위젯)의
// 근거가 되는 전체 글: 이번 주 요약 + 섹터별 예상 근거 + 종목별 상세 근거.
// 기록보관소(ArchiveHub의 예상리포트 탭, 지난 주들의 채점 결과)와는 별개로
// "이번 주" 예측 한 건만 보여준다.
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

  const sectors = parsePredictionSectors(latest.sectors);
  const candidates = parsePredictionCandidates(latest.candidates);
  const details = candidates.length > 0 ? await getCandidateDetails(candidates) : [];

  return (
    <section style={panelStyle}>
      <div style={sectionTitleStyle}>📝 Golgoo 예상 리포트 · {formatDateLabel(latest.forDate)} (5거래일 추적)</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={blockStyle}>
          <div style={blockHeaderStyle}>
            <span style={badgeStyle}>1</span>
            <span style={blockLabelStyle}>내용</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", margin: 0 }}>
            {renderBold(latest.summary)}
          </p>
        </div>

        {sectors.length > 0 && (
          <div style={blockStyle}>
            <div style={blockHeaderStyle}>
              <span style={badgeStyle}>2</span>
              <span style={blockLabelStyle}>주목 섹터</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sectors.map((s) => (
                <div key={s.name} style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)" }}>{s.name}</span>
                  <span style={{ color: "var(--dim)" }}> — {renderBold(s.reasoning)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {candidates.length > 0 && (
          <div style={blockStyle}>
            <div style={blockHeaderStyle}>
              <span style={badgeStyle}>3</span>
              <span style={blockLabelStyle}>종목 근거</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {details.map((d) => (
                <DetailCard key={d.name} d={d} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
