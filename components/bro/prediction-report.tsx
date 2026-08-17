import { getLatestPrediction, parsePredictionCandidates, parsePredictionSectors } from "@/lib/prediction-scoring";
import { weekInfoFromKey } from "@/lib/week";
import { renderBold } from "@/components/ui/rich-text";

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

// 리포트 안을 ①내용 ②주목 섹터 ③예상 종목 근거, 번호 붙은 카드 3개로 나눠서
// 한눈에 구분되게 보여준다 — 대화창/우측 두 박스(예상종목·기록보관소)는
// 이 컴포넌트 밖이라 영향 없음.
const blockStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 14,
};

const blockHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
};

const badgeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "var(--accent-soft)",
  color: "var(--accent)",
  fontSize: 11,
  fontWeight: 800,
  fontFamily: "var(--mono)",
  flexShrink: 0,
};

const blockLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text)",
};

// 이번 주 Golgoo 예상 리포트 — CandidateTracker(4번, 예상종목 라이브 위젯)의
// 근거가 되는 전체 글: 이번 주 요약 + 섹터별 예상 근거 + 종목별 예상 근거.
// 라이브 시세 조회는 하지 않는 순수 텍스트라 CandidateTracker보다 훨씬
// 가볍다 — 기록보관소(PredictionArchive, 지난 주들의 채점 결과)와는 별개로
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

  const info = weekInfoFromKey(latest.forWeekKey);
  const sectors = parsePredictionSectors(latest.sectors);
  const candidates = parsePredictionCandidates(latest.candidates);

  return (
    <section style={panelStyle}>
      <div style={sectionTitleStyle}>📝 Golgoo 예상 리포트 · {info.label} (5일간)</div>

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
              <span style={blockLabelStyle}>예상 종목 근거</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {candidates.map((c) => (
                <div key={c.name} style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>{c.name}</span>
                  <span style={{ color: "var(--dim)" }}> — {renderBold(c.reasoning)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
