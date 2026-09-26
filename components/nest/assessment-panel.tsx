"use client";

import { useEffect, useState } from "react";
import { chgColorVar, formatChg } from "@/lib/format";
import { STATE_ICON, type AssessmentState, type HoldingAssessment } from "@/lib/holding-assessment";
import type { AssessmentReport } from "@/lib/holding-assessment-store";
import type { PortfolioAdvice } from "@/lib/portfolio-advisor";
import { renderBold } from "@/components/ui/rich-text";

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent-soft), transparent 45%), var(--panel)",
  border: "1px solid var(--border2)",
  borderRadius: 14,
  padding: 20,
};

const STATE_COLOR: Record<AssessmentState, string> = {
  유지: "var(--up)",
  관찰: "var(--accent)",
  축소검토: "#f08a24",
  정밀점검: "var(--down)",
};

// 신호 점수 색: 국내 관례대로 좋은 신호=빨강, 나쁜 신호=파랑, 중립/없음=회색
function signalColor(score: number | null): string {
  if (score === null) return "var(--faint)";
  if (score > 0) return "var(--up)";
  if (score < 0) return "var(--down)";
  return "var(--dim)";
}

const fmt = (n: number) => Math.round(n).toLocaleString();
const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--faint)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "var(--mono)", color: color ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

function HoldingDetail({ a, report }: { a: HoldingAssessment; report: AssessmentReport }) {
  const hist = report.history[a.code];
  const t = a.tech;
  const opt = (n: number | null) => (n === null ? "-" : formatChg(n));
  return (
    <div style={{ padding: "4px 12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 10 }}>
        <Metric label="평균 매입가" value={`${fmt(a.avgBuyPrice)}원`} />
        <Metric label="현재가" value={`${fmt(a.currentPrice)}원`} />
        <Metric label="손익" value={a.changePct !== null ? formatChg(a.changePct) : "-"} color={a.changePct !== null ? chgColorVar(a.changePct) : undefined} />
        <Metric label="원금 회복 필요" value={a.recoveryNeededPct !== null ? `+${a.recoveryNeededPct.toFixed(1)}%` : "-"} />
        <Metric label="1개월" value={opt(t.ret1m)} />
        <Metric label="3개월" value={opt(t.ret3m)} />
        <Metric label="1년" value={opt(t.ret1y)} />
        <Metric label="52주 고점 대비" value={opt(t.fromHigh52w)} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {a.signals.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: signalColor(s.score), flexShrink: 0, alignSelf: "center" }} />
            <span style={{ fontWeight: 700, width: 44, flexShrink: 0 }}>{s.label}</span>
            <span style={{ color: "var(--dim)", lineHeight: 1.5 }}>{s.note}</span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>판정 근거: {a.stateNote}</div>
      </div>

      {hist && hist.entries.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)", marginBottom: 6 }}>판단 이력</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {[...hist.entries].reverse().map((e) => (
              <span key={e.date} style={{ fontSize: 10.5, fontFamily: "var(--mono)", padding: "2px 7px", borderRadius: 20, background: "var(--panel2)", border: "1px solid var(--border)", color: STATE_COLOR[e.state] }}>
                {shortDate(e.date)} {STATE_ICON[e.state]} {e.state}
              </span>
            ))}
          </div>
          {hist.lastChange && (
            <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 8, lineHeight: 1.6 }}>
              {shortDate(hist.lastChange.fromDate)} {STATE_ICON[hist.lastChange.fromState]} {hist.lastChange.fromState} → 지금 {STATE_ICON[a.state]} {a.state}
              {hist.lastChange.reasons.length > 0 && <> · 바뀐 신호: {hist.lastChange.reasons.join(" / ")}</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 둥지의 "AI 골구 포트폴리오 진단" 통합 카드 — 위에서 아래로
// 요약(AI) → 경고(코드) → 종목별 판정(코드) → 골구의 제안(AI) 순서로 읽힌다.
// 숫자와 판정은 lib/holding-assessment.ts가 계산하고, AI(lib/portfolio-advisor.ts)는
// 그 결과를 설명만 한다. 종합 점수는 일부러 안 보여준다(가중치가 임의라 정밀해
// 보이는 착시를 줌). 시세/일봉/수급/재무를 종목마다 가져오는 무거운 계산이라
// 서버 렌더에 끼우지 않고 마운트된 뒤 지연 로딩한다. 판정과 AI 설명은 서로
// 기다리지 않고 각자 도착하는 대로 그린다(서버는 같은 계산을 한 번만 한다).
export function AssessmentPanel() {
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<PortfolioAdvice | null>(null);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function post<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data?.error ?? "가져오지 못했어요" };
      return { ok: true, data };
    } catch {
      return { ok: false, error: "가져오지 못했어요" };
    }
  }

  function load() {
    setLoadingReport(true);
    setLoadingAdvice(true);
    setReportError(null);
    setAdviceError(null);
    post<AssessmentReport>("/api/portfolio/assessment").then((r) => {
      if (r.ok) setReport(r.data);
      else setReportError(r.error);
      setLoadingReport(false);
    });
    post<PortfolioAdvice>("/api/portfolio/advice").then((r) => {
      if (r.ok) setAdvice(r.data);
      else setAdviceError(r.error);
      setLoadingAdvice(false);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = loadingReport || loadingAdvice;
  const sectionTitle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "var(--faint)", marginBottom: 8 };

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: "linear-gradient(135deg, var(--accent), var(--up))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0d13",
              fontWeight: 800,
              fontSize: 11,
            }}
          >
            G
          </div>
          <span style={{ fontWeight: 800, fontSize: 14 }}>AI 골구 포트폴리오 진단</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", borderRadius: 20, padding: "2px 8px" }}>
            규칙 기반 초안 · 검증 중
          </span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ border: "1px solid var(--border)", background: "var(--panel)", color: "var(--dim)", borderRadius: 7, padding: "4px 10px", fontSize: 11, cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "진단 중..." : "다시 진단"}
        </button>
      </div>

      {/* 1. 한눈에 보는 요약 (AI) */}
      {advice && <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", margin: "0 0 14px" }}>{renderBold(advice.summary)}</p>}
      {!advice && loadingAdvice && <div style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 14 }}>골구가 포트폴리오를 정리하는 중...</div>}
      {!advice && adviceError && !loadingAdvice && <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 14 }}>AI 요약: {adviceError}</div>}

      {/* 2. 경고 (코드) */}
      {report && report.flags.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {report.flags.map((f, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                lineHeight: 1.55,
                padding: "8px 11px",
                borderRadius: 9,
                background: f.level === "high" ? "var(--down-soft)" : "var(--accent-soft)",
                color: "var(--text)",
                borderLeft: `3px solid ${f.level === "high" ? "var(--down)" : "var(--accent)"}`,
              }}
            >
              {f.text}
            </div>
          ))}
        </div>
      )}

      {/* 3. 종목별 판정 (코드) */}
      {loadingReport && !report && (
        <div style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 14 }}>
          보유 종목의 시세·차트·수급·재무를 확인하는 중... (종목이 많으면 30초 넘게 걸릴 수 있어요)
        </div>
      )}
      {reportError && !report && <div style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 14 }}>{reportError}</div>}
      {report && report.assessments.length === 0 && !loadingReport && (
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6, marginBottom: 14 }}>
          진단할 보유 종목이 없어요. 아래에서 종목을 등록하면 여기에 판정이 나와요.
        </div>
      )}
      {report && report.assessments.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={sectionTitle}>종목별 판정 (위험 순 · 눌러서 근거 보기)</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 72px 86px 56px 86px",
              gap: 6,
              padding: "5px 12px",
              fontSize: 10.5,
              color: "var(--faint)",
              fontFamily: "var(--mono)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span>종목</span>
            <span style={{ textAlign: "right" }}>손익</span>
            <span style={{ textAlign: "right" }}>회복 필요</span>
            <span style={{ textAlign: "right" }}>비중</span>
            <span style={{ textAlign: "right" }}>판정</span>
          </div>
          {report.assessments.map((a) => (
            <div key={a.code} style={{ borderBottom: "1px solid var(--border)" }}>
              <div
                onClick={() => setOpen(open === a.code ? null : a.code)}
                className="hover-row"
                style={{ display: "grid", gridTemplateColumns: "1fr 72px 86px 56px 86px", gap: 6, padding: "9px 12px", fontSize: 12.5, alignItems: "center", cursor: "pointer" }}
              >
                <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600, color: a.changePct !== null ? chgColorVar(a.changePct) : "var(--faint)" }}>
                  {a.changePct !== null ? formatChg(a.changePct) : "-"}
                </span>
                <span style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--dim)" }}>
                  {a.recoveryNeededPct !== null ? `+${a.recoveryNeededPct.toFixed(0)}%` : "-"}
                </span>
                <span style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--dim)" }}>{a.weightPct !== null ? `${a.weightPct.toFixed(0)}%` : "-"}</span>
                <span style={{ textAlign: "right", fontWeight: 800, fontSize: 11.5, color: STATE_COLOR[a.state] }}>
                  {STATE_ICON[a.state]} {a.state}
                </span>
              </div>
              {open === a.code && <HoldingDetail a={a} report={report} />}
            </div>
          ))}
        </div>
      )}

      {/* 4. 골구의 제안 (AI — 위 판정을 근거로 인용) */}
      {advice && advice.suggestions.length > 0 && (
        <div>
          <div style={sectionTitle}>골구의 제안</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {advice.suggestions.map((s, i) => (
              <div key={i} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text)" }}>{renderBold(s.action)}</div>
                <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 3 }}>{renderBold(s.reason)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report && report.assessments.length > 0 && (
        <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 14, lineHeight: 1.6 }}>
          판정은 차트(20·60일선)·수급(외국인/기관 5일)·거래량·재무(흑자/적자) 4가지 신호를 규칙으로 합쳐 정한 초안이고, 손실률만으로 매도를 권하지는 않아요. 판단 이력은 오늘부터 쌓이기 시작해요.
        </div>
      )}
    </section>
  );
}
