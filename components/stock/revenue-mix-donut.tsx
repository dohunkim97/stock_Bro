// 매출 비중 도넛차트 — DART 공시 원문 표(lib/dart.ts의 productsTables)에서
// 실제 숫자를 뽑아 그린다(AI 기업분석의 서술형 %와 달리 표에 있는 진짜
// 수치). 회사마다 표 모양이 제각각이라(합쳐진 셀, 기간별 다열 등) 못 뽑아낸
// 경우엔 도넛 없이 표만 보여주는 게 맞아서, 호출부(detail-sections.tsx)가
// extractRevenueMix 결과가 비었을 때 이 컴포넌트를 아예 안 그린다.
//
// 색상은 app/globals.css의 --series-1~5(다크/라이트 모드 각각 CVD 안전성
// 검증됨, dataviz 스킬의 marks-and-anatomy.md 기준 — 세그먼트 사이 물리적
// 간격 + 직접 라벨 + 범례를 항상 같이 써서 색만으로 구분하지 않는다.

export type RevenueSegment = { label: string; pct: number };

const R = 70;
const THICKNESS = 26;
const CX = 100;
const CY = 100;
const SERIES_VARS = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5"];

// 사업부문 이름이 길면(예: "기초화합물(냉매 外)") 직접 라벨/범례가 넘치니
// 적당히 줄인다 — 전체 이름은 <title> 호버 툴팁과 범례에서 볼 수 있다.
function shortLabel(label: string, max = 10): string {
  return label.length > max ? label.slice(0, max) + "…" : label;
}

// 12시 방향(-90°)을 0으로 두고 시계방향으로 증가하는 각도 하나를 원 위의
// 점으로 바꾼다. SVG는 y축이 아래로 증가해서, 이 각도 증가 방향이 sweep
// flag=1(시계방향)과 그대로 맞아떨어진다.
function polarPoint(deg: number, radius: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

export function RevenueMixDonut({ segments }: { segments: RevenueSegment[] }) {
  const total = segments.reduce((s, seg) => s + seg.pct, 0);
  if (total <= 0) return null;

  const gapDeg = segments.length > 1 ? 2.5 : 0; // 세그먼트 사이 물리적 여백(색만으로 안 가르게)
  let cursorDeg = -90; // 12시에서 시작

  const arcs = segments.map((seg, i) => {
    const shareDeg = (seg.pct / total) * 360;
    const startDeg = cursorDeg + gapDeg / 2;
    const endDeg = cursorDeg + shareDeg - gapDeg / 2;
    cursorDeg += shareDeg;
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    const [sx, sy] = polarPoint(startDeg, R);
    const [ex, ey] = polarPoint(Math.max(endDeg, startDeg + 0.01), R);
    const midDeg = startDeg + (endDeg - startDeg) / 2;
    const [labelX, labelY] = polarPoint(midDeg, R + THICKNESS / 2 + 16);
    const isOther = i >= SERIES_VARS.length;
    const color = isOther ? "var(--series-other)" : `var(${SERIES_VARS[i]})`;
    const showInlineLabel = seg.pct / total >= 0.08; // 8% 미만은 범례로만(마크 겹침 방지)
    return { key: seg.label + i, color, d: `M ${sx} ${sy} A ${R} ${R} 0 ${largeArc} 1 ${ex} ${ey}`, label: seg.label, pct: seg.pct, showInlineLabel, labelX, labelY };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <svg viewBox="0 0 200 200" width={200} height={200} role="img" aria-label="매출 비중 도넛차트">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border2)" strokeWidth={THICKNESS} opacity={0.4} />
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill="none" stroke={a.color} strokeWidth={THICKNESS} strokeLinecap="butt">
            <title>
              {a.label} {a.pct.toFixed(1)}%
            </title>
          </path>
        ))}
        {arcs
          .filter((a) => a.showInlineLabel)
          .map((a) => (
            <text
              key={`label-${a.key}`}
              x={a.labelX}
              y={a.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fontFamily="var(--mono)"
              fontWeight={700}
              fill="var(--dim)"
            >
              {a.pct.toFixed(0)}%
            </text>
          ))}
      </svg>

      {/* 범례 — 2개 이상 항목은 항상 범례를 같이 둔다(색으로만 구분하지 않음) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", justifyContent: "center" }}>
        {arcs.map((a) => (
          <div key={`legend-${a.key}`} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: a.color, flexShrink: 0 }} />
            <span style={{ color: "var(--text)" }}>{shortLabel(a.label)}</span>
            <span style={{ color: "var(--faint)", fontFamily: "var(--mono)" }}>{a.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// DART 공시 표 원문(lib/dart.ts의 DartTable = string[][])에서 "사업부문 |
// 매출액(비율)" 같은 행을 찾아 { label, pct }로 뽑는다. 회사마다 표 모양이
// 갈려서(단일 매출/비율 열 vs 기간별 다열, 합쳐진 셀 등) 최대한 관대하게
// 파싱한다 — 실패(설득력 있는 숫자를 못 찾음)하면 빈 배열을 돌려주고,
// 호출부가 도넛 대신 표만 보여준다.
export function extractRevenueMix(table: string[][]): RevenueSegment[] {
  const segments: RevenueSegment[] = [];
  for (const row of table.slice(1)) {
    const label = row[0]?.trim();
    if (!label) continue;
    // DART 표는 "합 계"처럼 글자 사이에 공백을 넣는 관행이 있어서(실측:
    // 후성 표의 총계 행이 "합계"가 아니라 "합 계") \s*로 그 공백까지 잡는다
    // — 이걸 안 거르면 총계(100%) 행이 세그먼트 하나로 잘못 들어가 버려서
    // 합이 200%가 되고, 아래 total 정합성 체크에 걸려 도넛 전체가 꺼진다.
    if (/합\s*계|총\s*계|소\s*계|^\(|^-$|^매\s*출|^비\s*율|^비\s*중|내부\s*거래/.test(label)) continue;

    // 회계 표기 관례상 음수를 "-271,085"가 아니라 "△271,085"(세모)로 쓰는
    // 경우가 많다(실측: 삼성전자 표의 "기타(부문간 내부거래 제거)" 행) —
    // "-"만 보고 있으면 이런 조정/차감 행이 음수인 줄 모르고 양수 퍼센트로
    // 들어가 버린다.
    let pct: number | null = null;
    for (let i = row.length - 1; i >= 1; i--) {
      const cell = row[i];
      const paren = cell.match(/\(\s*(△|-)?\s*([\d.]+)\s*%?\s*\)/);
      if (paren) {
        pct = (paren[1] ? -1 : 1) * parseFloat(paren[2]);
        break;
      }
      const trailing = cell.match(/(△|-)?\s*([\d.]+)\s*%$/);
      if (trailing) {
        pct = (trailing[1] ? -1 : 1) * parseFloat(trailing[2]);
        break;
      }
    }
    if (pct === null || pct <= 0) continue;
    segments.push({ label, pct });
  }

  const total = segments.reduce((s, seg) => s + seg.pct, 0);
  if (total < 60 || total > 140) return []; // 파싱 신뢰 안 되면 도넛 자체를 스킵

  // 5개 넘으면 작은 순서대로 "기타"에 접는다(dataviz 스킬: 5-6 소프트 캡).
  if (segments.length > 6) {
    segments.sort((a, b) => b.pct - a.pct);
    const top = segments.slice(0, 5);
    const restPct = segments.slice(5).reduce((s, seg) => s + seg.pct, 0);
    return [...top, { label: "기타", pct: restPct }];
  }
  return segments;
}
