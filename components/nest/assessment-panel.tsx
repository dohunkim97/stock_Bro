"use client";

import { useEffect, useState } from "react";
import { chgColorVar, formatChg } from "@/lib/format";
import { STATE_ICON, type AssessmentState, type HoldingAssessment } from "@/lib/holding-assessment";
import type { AssessmentReport } from "@/lib/holding-assessment-store";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
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

// 규칙 기반 종목 진단 — 숫자와 판정은 lib/holding-assessment.ts가 계산하고 여기서는
// 그대로 보여주기만 한다. 종합 점수는 일부러 안 보여준다(가중치가 임의라 정밀해
// 보이는 착시를 줌). 종목마다 시세/일봉/수급/재무를 가져오는 무거운 계산이라
// 어드바이저 카드처럼 마운트된 뒤 지연 로딩한다.
export function AssessmentPanel() {
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/assessment", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "진단을 가져오지 못했어요");
        return;
      }
      setReport(data);
    } catch {
      setError("진단을 가져오지 못했어요");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>🧠 AI 골구 종목 진단</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", borderRadius: 20, padding: "2px 8px" }}>
            규칙 기반 초안 · 검증 중
          </span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--dim)", borderRadius: 7, padding: "4px 10px", fontSize: 11, cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "진단 중..." : "다시 진단"}
        </button>
      </div>

      {loading && !report && <div style={{ fontSize: 12.5, color: "var(--faint)" }}>보유 종목의 시세·차트·수급·재무를 확인하는 중... (종목이 많으면 30초 넘게 걸릴 수 있어요)</div>}
      {error && <div style={{ fontSize: 12.5, color: "var(--faint)" }}>{error}</div>}

      {report && report.assessments.length === 0 && !loading && (
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>진단할 보유 종목이 없어요. 아래에서 종목을 등록하면 여기에 판정이 나와요.</div>
      )}

      {report && report.assessments.length > 0 && (
        <>
          {report.flags.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 86px 56px 86px", gap: 6, padding: "5px 12px", fontSize: 10.5, color: "var(--faint)", fontFamily: "var(--mono)", borderBottom: "1px solid var(--border)" }}>
            <span>종목 (위험 순)</span>
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
                <span style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--dim)" }}>{a.recoveryNeededPct !== null ? `+${a.recoveryNeededPct.toFixed(0)}%` : "-"}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--dim)" }}>{a.weightPct !== null ? `${a.weightPct.toFixed(0)}%` : "-"}</span>
                <span style={{ textAlign: "right", fontWeight: 800, fontSize: 11.5, color: STATE_COLOR[a.state] }}>
                  {STATE_ICON[a.state]} {a.state}
                </span>
              </div>
              {open === a.code && <HoldingDetail a={a} report={report} />}
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 10, lineHeight: 1.6 }}>
            판정은 차트(20·60일선)·수급(외국인/기관 5일)·거래량·재무(흑자/적자) 4가지 신호를 규칙으로 합쳐 정한 초안이고, 손실률만으로 매도를 권하지는 않아요. 판단 이력은 오늘부터 쌓이기 시작해요.
          </div>
        </>
      )}
    </section>
  );
}
