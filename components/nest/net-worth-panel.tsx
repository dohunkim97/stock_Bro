"use client";

// 둥지 리뉴얼 — 순자산 현황 + 추이. 단일 시계열(순자산 하나)이라
// dataviz 스킬 기준 범례가 필요 없는 케이스(시리즈 1개)라 색은
// 브랜드 강조색(--accent) 하나만 쓰고, 등락 숫자만 상승/하락 관례색으로
// 구분한다. 호버하면 그 날짜의 정확한 값을 보여준다(스킬의 "라인/영역
// 차트는 기본으로 호버 레이어" 원칙).
import { useState, useRef } from "react";
import { formatWon } from "@/lib/format";
import type { NetWorthSnapshot } from "@/lib/finance-engine";

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent-soft), transparent 60%)",
  border: "1px solid var(--border2)",
  borderRadius: 16,
  padding: 22,
};

type HistoryPoint = { date: string; netWorth: number };

function chgColor(pct: number): string {
  return pct >= 0 ? "var(--up)" : "var(--down)";
}

export function NetWorthPanel({ current, history }: { current: NetWorthSnapshot; history: HistoryPoint[] }) {
  const [hover, setHover] = useState<{ x: number; point: HistoryPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const first = history.length > 0 ? history[0] : null;
  const changePct = first && first.netWorth !== 0 ? ((current.netWorth - first.netWorth) / Math.abs(first.netWorth)) * 100 : null;

  const W = 640;
  const H = 100;
  const PAD = 6;
  const values = history.map((h) => h.netWorth).concat(current.netWorth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = history.map((h, i) => {
    const x = history.length > 1 ? (i / (history.length - 1)) * (W - PAD * 2) + PAD : W / 2;
    const y = H - PAD - ((h.netWorth - min) / range) * (H - PAD * 2);
    return { x, y, point: h };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (points.length === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = points[0];
    for (const p of points) {
      if (Math.abs(p.x - relX) < Math.abs(nearest.x - relX)) nearest = p;
    }
    setHover({ x: nearest.x, point: nearest.point });
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--accent)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            💰 순자산 현황
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)" }}>{formatWon(current.netWorth)}</div>
          {changePct !== null && (
            <div style={{ fontSize: 12, fontWeight: 700, color: chgColor(changePct), marginTop: 2 }}>
              {changePct >= 0 ? "+" : ""}
              {changePct.toFixed(1)}% (최근 {history.length}일)
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 11, color: "var(--faint)" }}>
          <div>
            <div>총자산</div>
            <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 13 }}>{formatWon(current.totalAssets)}</div>
          </div>
          <div>
            <div>총부채</div>
            <div style={{ fontWeight: 700, color: "var(--down)", fontSize: 13 }}>{formatWon(current.totalDebt)}</div>
          </div>
        </div>
      </div>

      {points.length >= 2 && (
        <div style={{ position: "relative", marginTop: 14 }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            style={{ display: "block", cursor: "crosshair" }}
          >
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {hover && (
              <>
                <line x1={hover.x} y1={0} x2={hover.x} y2={H} stroke="var(--border2)" strokeWidth={1} />
                <circle cx={hover.x} cy={points.find((p) => p.point === hover.point)?.y ?? 0} r={4} fill="var(--accent)" />
              </>
            )}
          </svg>
          {hover && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: `${Math.min(85, (hover.x / W) * 100)}%`,
                background: "var(--panel)",
                border: "1px solid var(--border2)",
                borderRadius: 8,
                padding: "5px 9px",
                fontSize: 10.5,
                fontFamily: "var(--mono)",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              <div style={{ color: "var(--faint)" }}>{hover.point.date}</div>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{formatWon(hover.point.netWorth)}</div>
            </div>
          )}
        </div>
      )}
      {points.length < 2 && (
        <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 14 }}>
          하루 지나면 추이 그래프가 쌓이기 시작해요(오늘 방문 기준으로 매일 한 번씩 기록돼요).
        </div>
      )}
    </section>
  );
}
