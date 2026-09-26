import Link from "next/link";
import { renderBold } from "@/components/ui/rich-text";
import { formatWon } from "@/lib/format";
import type { PeriodAnalysisData } from "@/lib/period-analysis";
import { baselineStat, type ConditionStat, type StockGroup, type SummaryStats } from "@/lib/prediction-stats";
import { OutcomeBadge, fmtSigned, pnlColor } from "./outcome-badge";

// 주간분석/월간분석 상세 (2026-09-25 개편, GPT 피드백 반영) — 종목 나열이
// 중심이 아니라 "한눈에 보기(숫자) → 총평 → 조건별 성과 → 다음 예측 반영 →
// 종목별 상세(접힘)" 순서. 숫자는 전부 결과 DB(lib/prediction-stats.ts)에서
// 코드가 집계한 값이고, 표본이 작은 조건에는 신뢰도 표시를 붙인다.

const boxStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 14,
};

const sectionTitle: React.CSSProperties = { fontWeight: 800, fontSize: 12.5, marginBottom: 10 };

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: "1 1 96px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--faint)", fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--mono)", color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 1, fontFamily: "var(--mono)" }}>{sub}</div>}
    </div>
  );
}

// 결과 분포 막대 — 목표/손절/기간종료/판정불가 비율을 한 줄로(세그먼트 사이
// 2px 간격). 색은 앱 전체가 쓰는 상승/하락/중립 관례색.
function OutcomeBar({ s }: { s: SummaryStats }) {
  if (s.rated === 0) return null;
  const segs = [
    { n: s.target, color: "var(--up)", label: "목표 도달" },
    { n: s.stop, color: "var(--down)", label: "손절" },
    { n: s.timeout, color: "var(--dim)", label: "기간 종료" },
    { n: s.ambiguous, color: "var(--accent)", label: "판정 불가" },
  ].filter((x) => x.n > 0);
  return (
    <div style={{ display: "flex", gap: 2, height: 8, borderRadius: 20, overflow: "hidden", margin: "12px 0 4px" }}>
      {segs.map((x) => (
        <div
          key={x.label}
          title={`${x.label} ${x.n}건 (${((x.n / s.rated) * 100).toFixed(0)}%)`}
          style={{ flex: x.n, background: x.color }}
        />
      ))}
    </div>
  );
}

function OverviewBlock({ s }: { s: SummaryStats }) {
  const rate = (v: number | null) => (v === null ? "-" : `${v.toFixed(1)}%`);

  // 목표가/손절가가 저장되기 전의 옛 기록만 있는 기간 — 목표/손절 통계는 비어
  // 있으니 0건짜리 타일을 늘어놓지 않고 5일 종가 기준 사실만 보여준다.
  if (s.rated === 0) {
    return (
      <div style={boxStyle}>
        <div style={sectionTitle}>📊 이번 기간 한눈에 보기</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Tile label="예측" value={`${s.total}건`} />
          <Tile label="5일 종가 상승" value={`${s.closeUp}건`} color="var(--up)" />
          <Tile label="5일 종가 하락" value={`${s.closeDown}건`} color="var(--down)" />
          <Tile label="5일 종가 평균" value={fmtSigned(s.avgClosePct, 2)} sub={`중앙값 ${fmtSigned(s.medianClosePct, 2)}`} color={pnlColor(s.avgClosePct)} />
          <Tile label="최고 / 최저" value={fmtSigned(s.bestClosePct, 1)} sub={fmtSigned(s.worstClosePct, 1)} />
        </div>
        <div style={{ marginTop: 10, fontSize: 10.5, color: "var(--faint)", lineHeight: 1.6 }}>
          * 이 기간 예측은 추천 당시 목표가·손절가가 저장되기 전 기록이라 목표/손절 판정과 실현수익은 계산할 수 없어요.
        </div>
      </div>
    );
  }
  const belowBreakeven = s.targetRate !== null && s.breakevenTargetRate !== null && s.targetRate < s.breakevenTargetRate;

  return (
    <div style={boxStyle}>
      <div style={sectionTitle}>📊 이번 기간 한눈에 보기</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Tile label="예측" value={`${s.total}건`} sub={`판정 가능 ${s.rated}건`} />
        <Tile label="🎯 목표 도달" value={`${s.target}건`} sub={rate(s.targetRate)} color="var(--up)" />
        <Tile label="🛑 손절" value={`${s.stop}건`} sub={rate(s.stopRate)} color="var(--down)" />
        <Tile label="⏱ 기간 종료" value={`${s.timeout}건`} sub={rate(s.timeoutRate)} />
        <Tile label="❓ 판정 불가" value={`${s.ambiguous}건`} sub="같은 날 목표·손절" color="var(--accent)" />
      </div>
      <OutcomeBar s={s} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <Tile label="평균 실현수익" value={fmtSigned(s.avgRealizedPct, 2)} sub={`중앙값 ${fmtSigned(s.medianRealizedPct, 2)}`} color={pnlColor(s.avgRealizedPct)} />
        <Tile
          label="가상 포트폴리오"
          value={s.virtualPnlPerMillion === null ? "-" : `${s.virtualPnlPerMillion >= 0 ? "+" : "-"}${formatWon(Math.abs(s.virtualPnlPerMillion))}`}
          sub={`종목당 100만원 · ${s.rated}종목`}
          color={pnlColor(s.virtualPnlPerMillion)}
        />
        <Tile label="최악 실현" value={fmtSigned(s.worstRealizedPct, 2)} color="var(--down)" />
        <Tile label="5일 종가 평균" value={fmtSigned(s.avgClosePct, 2)} sub={`최고 ${fmtSigned(s.bestClosePct, 1)} / 최저 ${fmtSigned(s.worstClosePct, 1)}`} color={pnlColor(s.avgClosePct)} />
      </div>

      {s.rewardRisk !== null && s.breakevenTargetRate !== null && (
        <div style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7, color: "var(--dim)" }}>
          평균 목표 <b style={{ color: "var(--up)" }}>{fmtSigned(s.avgTargetPct)}</b> · 평균 손절{" "}
          <b style={{ color: "var(--down)" }}>{fmtSigned(s.avgStopPct)}</b> → 손익비 <b style={{ color: "var(--text)" }}>{s.rewardRisk.toFixed(2)} : 1</b>, 손익분기 목표도달률{" "}
          <b style={{ color: "var(--text)" }}>{s.breakevenTargetRate.toFixed(1)}%</b>
          {" "}(기간 종료 제외 단순화) — 현재 목표 도달률 <b style={{ color: belowBreakeven ? "var(--down)" : "var(--up)" }}>{rate(s.targetRate)}</b>로{" "}
          <b style={{ color: belowBreakeven ? "var(--down)" : "var(--up)" }}>{belowBreakeven ? "손익분기 아래" : "손익분기 이상"}</b>이에요.
        </div>
      )}
      {s.unrated > 0 && (
        <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--faint)" }}>
          * 추천 당시 목표가·손절가가 저장되지 않은 옛 기록 {s.unrated}건은 목표/손절 통계에서 빼고 5일 종가 수익률에만 반영했어요.
        </div>
      )}
    </div>
  );
}

function confidenceColor(c: ConditionStat["confidence"]): string {
  if (c === "표본 부족") return "var(--faint)";
  if (c === "신뢰도 낮음") return "var(--dim)";
  return "var(--accent)";
}

function ConditionRow({ c, dimmed, note }: { c: ConditionStat; dimmed?: boolean; note?: string }) {
  if (c.n === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, opacity: c.n < 10 || dimmed ? 0.55 : 1, flexWrap: "wrap" }}>
      <span style={{ flex: "1 1 130px", fontWeight: 700 }}>{c.label}</span>
      <span style={{ fontFamily: "var(--mono)", color: "var(--faint)", width: 34, textAlign: "right" }}>{c.n}건</span>
      <span style={{ fontFamily: "var(--mono)", width: 96 }}>
        <span style={{ color: "var(--up)" }}>🎯{c.targetRate?.toFixed(0)}%</span> <span style={{ color: "var(--down)" }}>🛑{c.stopRate?.toFixed(0)}%</span>
      </span>
      <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: pnlColor(c.avgRealizedPct), width: 54, textAlign: "right" }}>{fmtSigned(c.avgRealizedPct)}</span>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: confidenceColor(c.confidence) }}>{note ?? c.confidence}</span>
    </div>
  );
}

function ConditionBlock({ data }: { data: PeriodAnalysisData }) {
  const anyVerdict = data.verdictStats.some((v) => v.positive.n > 0 || v.negative.n > 0);
  const anyFeature = data.featureStats.some((c) => c.n > 0);
  if (!anyVerdict && !anyFeature) return null;
  const base = baselineStat(
    // 기준선은 이 기간 전체 — 종목별 묶음의 세부 예측을 다시 펼쳐서 계산
    data.stockGroups.flatMap((g) => g.entries)
  );

  return (
    <div style={boxStyle}>
      <div style={sectionTitle}>🔎 조건별 성과 — 어떤 신호가 실제로 통했나</div>
      <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 10, lineHeight: 1.6 }}>
        🎯 목표 도달률 · 🛑 손절률(해당 조건이면서 판정 가능한 건 기준) · 평균 실현수익. <b>맨 위 전체 평균과 비교해서</b> 보세요 — 후보 대부분이
        해당하는 조건은 전체 평균과 같은 얘기예요. 표본이 10건 미만이거나 반대 조건과 비교가 안 되면 흐리게 표시해요.
      </div>
      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
        <ConditionRow c={base} />
      </div>
      {anyVerdict && (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--accent)", marginBottom: 6 }}>신호별 (추천 당시 O/X 판단)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {data.verdictStats.flatMap((v) =>
              [v.positive, v.negative].map((c) => <ConditionRow key={c.label} c={c} dimmed={!v.comparable} note={v.comparable ? undefined : "비교 불가"} />)
            )}
          </div>
        </>
      )}
      {anyFeature && (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--accent)", marginBottom: 6 }}>추천 당시 수치·복합 조건</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.featureStats.map((c) => (
              <ConditionRow key={c.label} c={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InsightsList({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  return (
    <div style={{ background: "var(--accent-soft)", border: "1px solid var(--border2)", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8, color: "var(--accent)" }}>🤖 다음 예측에 반영</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: "var(--text)" }}>
        {insights.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>
        표본 10건 이상인 조건에서만 교훈을 뽑고, 그 아래는 관찰만 해요. 실제 숫자 근거는 누적 통계가 다음 종목 선정에 그대로 들어가요.
      </div>
    </div>
  );
}

function GroupCard({ g, explanation }: { g: StockGroup; explanation?: string }) {
  const counts = [
    g.target ? `🎯${g.target}` : "",
    g.stop ? `🛑${g.stop}` : "",
    g.timeout ? `⏱${g.timeout}` : "",
    g.ambiguous ? `❓${g.ambiguous}` : "",
    g.unrated ? `미저장${g.unrated}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <details style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px" }}>
      <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", listStyle: "none" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href={`/stock?code=${g.code}`} style={{ fontWeight: 700, fontSize: 12.5, color: "inherit", textDecoration: "none" }}>
            {g.name}
          </Link>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
            {g.predictions > 1 ? `${g.predictions}회 추천` : "1회"} · {counts}
          </span>
        </span>
        <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 12.5, color: pnlColor(g.avgRealizedPct ?? g.avgClosePct) }}>
          {g.avgRealizedPct !== null ? `실현 ${fmtSigned(g.avgRealizedPct)}` : `5일 종가 ${fmtSigned(g.avgClosePct)}`}
        </span>
      </summary>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {g.entries.map((e) => (
          <div key={e.forDate} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--mono)", color: "var(--faint)", width: 46 }}>{e.forDate.slice(5)}</span>
            <OutcomeBadge outcome={e.outcome} day={e.exitDay} />
            <span style={{ fontFamily: "var(--mono)" }}>
              {e.realizedPct !== null && (
                <>
                  실현 <b style={{ color: pnlColor(e.realizedPct) }}>{fmtSigned(e.realizedPct)}</b> ·{" "}
                </>
              )}
              5일 종가 <b style={{ color: pnlColor(e.closePct) }}>{fmtSigned(e.closePct)}</b>
            </span>
            {e.features && e.features.overheatScore >= 40 && (
              <span style={{ fontSize: 10, color: "var(--accent)" }} title={e.features.overheatReasons.join(", ")}>
                ⚠️ 과열 {e.features.overheatScore}
              </span>
            )}
          </div>
        ))}
        {explanation && (
          <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.6, color: "var(--text)", background: "var(--panel2)", borderRadius: 8, padding: "8px 10px" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--faint)", display: "block", marginBottom: 2 }}>사후 해설(참고용)</span>
            {renderBold(explanation)}
          </div>
        )}
      </div>
    </details>
  );
}

export function PeriodAnalysisDetail({ data }: { data: PeriodAnalysisData }) {
  const explanationByCode = new Map(data.explanations.map((e) => [e.code, e.text]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <OverviewBlock s={data.stats} />

      <div style={boxStyle}>
        <div style={sectionTitle}>총평</div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--text)" }}>{renderBold(data.summary)}</p>
      </div>

      <ConditionBlock data={data} />
      <InsightsList insights={data.insights} />

      {data.stockGroups.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--dim)", marginBottom: 8 }}>
            종목별 상세 ({data.stockGroups.length}종목 · 여러 번 추천된 종목이 위로)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.stockGroups.map((g) => (
              <GroupCard key={g.code} g={g} explanation={explanationByCode.get(g.code)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
