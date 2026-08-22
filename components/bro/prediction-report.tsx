import { getLatestPrediction, parsePredictionCandidates, parsePredictionSectors } from "@/lib/prediction-scoring";
import { weekInfoFromKey } from "@/lib/week";
import { renderBold } from "@/components/ui/rich-text";
import { getCandidateDetails, type CandidateDetail } from "@/lib/candidate-detail";
import { chgColorVar, formatChg } from "@/lib/format";

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

// 리포트 안을 ①내용 ②주목 섹터 ③종목 근거, 번호 붙은 카드 3개로 나눠서
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

const detailCardStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 14,
};

const fieldLineStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.65,
  color: "var(--text)",
};

const fieldLabelStyle: React.CSSProperties = {
  color: "var(--accent)",
  fontWeight: 700,
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={fieldLineStyle}>
      <span style={fieldLabelStyle}>■ {label}: </span>
      {value}
    </div>
  );
}

// 예전엔 "더보기" 버튼을 눌러야 모달로 뜨던 심층 카드를, 지금은 목록 바로
// 아래에 펼쳐두고 패널 자체 스크롤(panelStyle의 height:100%+overflowY:auto)로
// 내려보게 바꿨다 — 큰 틀(패널 크기)은 그대로 두고 안에서만 스크롤된다.
function DetailCard({ d }: { d: CandidateDetail }) {
  return (
    <div style={{ ...detailCardStyle, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>
          {d.name}
          {d.code && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", marginLeft: 5 }}>
              ({d.code})
            </span>
          )}
        </span>
        {d.themeTags.length > 0 && <span style={{ color: "var(--faint)" }}>|</span>}
        {d.themeTags.map((t) => (
          <span
            key={t}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--accent)",
              background: "var(--accent-soft)",
              borderRadius: 20,
              padding: "2px 9px",
            }}
          >
            #{t}
          </span>
        ))}
        {d.isThemeLeader && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              color: "var(--up)",
              background: "var(--up-soft)",
              borderRadius: 20,
              padding: "2px 9px",
            }}
          >
            대장주
          </span>
        )}
      </div>

      <Field label="사업 한 줄 요약" value={d.businessSummary} />
      <Field label="AI 추천 근거" value={d.aiReasoning} />
      <Field label="시황" value={d.marketContext} />
      <Field label="수급 상태" value={d.supplyDemand} />
      <Field label="차트" value={d.chartNote} />
      <Field label="재무요약" value={d.financialSummary} />

      <div style={fieldLineStyle}>
        <span style={fieldLabelStyle}>■ 전략 가이드:</span>
        <div style={{ paddingLeft: 14, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          <div>
            - 목표 구간:{" "}
            {d.strategy.targetPrice !== null ? (
              <>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                  {Math.round(d.strategy.targetPrice).toLocaleString()}원
                </span>{" "}
                {d.strategy.targetPct !== null && (
                  <span style={{ fontFamily: "var(--mono)", color: chgColorVar(d.strategy.targetPct) }}>
                    (기대수익 {formatChg(d.strategy.targetPct)})
                  </span>
                )}
              </>
            ) : (
              "데이터 부족"
            )}
          </div>
          <div>
            - 지지/손절선:{" "}
            {d.strategy.stopLossPrice !== null ? (
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                {Math.round(d.strategy.stopLossPrice).toLocaleString()}원
              </span>
            ) : (
              "데이터 부족"
            )}{" "}
            이탈 시 비중 축소
          </div>
        </div>
      </div>
    </div>
  );
}

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

  const info = weekInfoFromKey(latest.forWeekKey);
  const sectors = parsePredictionSectors(latest.sectors);
  const candidates = parsePredictionCandidates(latest.candidates);
  const details = candidates.length > 0 ? await getCandidateDetails(candidates) : [];

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
