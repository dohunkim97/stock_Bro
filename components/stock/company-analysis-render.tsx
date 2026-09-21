import { MarketNoteButton } from "./market-note-button";
import { GlossaryTerm, GlossaryText } from "@/components/ui/glossary-term";
import { findGlossaryMatch } from "@/lib/finance-glossary";
import { chgColorVar, formatChg } from "@/lib/format";

// scripts/watch-company-analysis.ts가 올려주는 CompanyAnalysis.rawJson을
// 실제로 그리는 순수 렌더링 조각들 — DB 접근이 전혀 없어서(prisma import
// 없음) 서버 컴포넌트(company-analysis-section.tsx, 종목상세용)와 클라이언트
// 컴포넌트(field-detail-modal.tsx, 골구 사업요약 모달용) 양쪽에서 그대로
// 재사용한다. 회사마다 category_N_.../sub_N_... 키 구성이 조금씩 달라서
// 고정 스키마로 안 만들고 여기서 최대한 유연하게 순회한다.

export type SubItem = Record<string, unknown>;
export type Category = { category_title?: string; [key: string]: unknown };

export function isSubItem(v: unknown): v is SubItem {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// 관찰된 실제 값들 기준 — "위험/우려 없음"처럼 부정 단어 뒤에 "없음"이 오면
// 오히려 긍정이라 그 패턴을 먼저 확인한다(순서가 중요: 아래에서 negation
// 먼저 검사).
function verdictColor(text: string): string | null {
  if (/(위험|우려|리스크)\s*(없음|낮음)/.test(text)) return "var(--up)";
  if (/위험|우려|주의|희석|부실|폭탄|저조|둔화/.test(text)) return "var(--down)";
  if (/안전|우수|양호|정상|없음|우량|호황|폭발|과점|주도|개선|확대|증가|적정/.test(text)) return "var(--up)";
  return null;
}

// "우량기업형(+ - -)", "정상"처럼 초보자에게 낯선 판정 배지는 사전
// (lib/finance-glossary.ts)에 등록돼 있으면 옆에 작은 ⓘ를 붙이고 클릭·호버
// 시 설명 팝오버가 뜨게 한다 — 사전에 없는 값은 그냥 평범한 배지 그대로.
function VerdictBadge({ text, color, inline = false }: { text: string; color: string; inline?: boolean }) {
  const match = findGlossaryMatch(text);
  const pill = (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        borderRadius: 20,
        padding: "3px 10px",
        marginTop: inline ? 0 : 4,
      }}
    >
      {text}
      {match && <span style={{ marginLeft: 4, opacity: 0.8, fontSize: 10 }}>ⓘ</span>}
    </span>
  );
  if (!match) return pill;
  return (
    <GlossaryTerm term={match.term} explanation={match.explanation} bare>
      {pill}
    </GlossaryTerm>
  );
}

// verdict성 필드(짧고 평가 어휘 위주)와 stats성 필드(길고 수치 나열)를
// 구분 — 짧은(대략 20자 이하) 문자열이면서 평가 색이 잡히면 뱃지로,
// 나머지는 그냥 줄글로.
function StatOrBadge({ text }: { text: string }) {
  const color = text.length <= 22 ? verdictColor(text) : null;
  if (color) return <VerdictBadge text={text} color={color} />;
  return (
    <div style={{ fontSize: 11.5, color: "var(--text)", lineHeight: 1.6, marginTop: 4, fontFamily: "var(--mono)" }}>
      <GlossaryText text={text} />
    </div>
  );
}

// 재무분석 6개 항목 각각에서 "판정" 역할을 하는 필드 하나를 찾는다(필드
// 이름이 trend_verdict/flow_pattern/cost_type/... 항목마다 달라서 이름으로
// 못 찾고, StatOrBadge와 같은 기준(짧고 평가 어휘)으로 값을 보고 찾는다) —
// 요약 표의 "판정" 칸에 쓴다.
function findVerdictField(item: SubItem): string | null {
  for (const [k, v] of Object.entries(item)) {
    if (k === "sub_title" || k === "title" || k === "story") continue;
    if (typeof v !== "string" || v.length === 0 || v.length > 22) continue;
    if (verdictColor(v)) return v;
  }
  return null;
}

// sub_title(사업/시황 등 기존 카테고리)과 title(재무분석 — finance_py.py가
// 채워주는 6개 항목은 이 키를 쓴다) 둘 다 받아준다 — 스키마가 프로그램마다
// 조금씩 다른 걸 여기서 흡수한다.
function SubItemCard({ item }: { item: SubItem }) {
  const title = typeof item.sub_title === "string" ? item.sub_title : typeof item.title === "string" ? item.title : null;
  const story = typeof item.story === "string" ? item.story : null;
  const rest = Object.entries(item).filter(
    ([k, v]) => k !== "sub_title" && k !== "title" && k !== "story" && typeof v === "string" && v.length > 0
  ) as [string, string][];

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      {title && <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>{title}</div>}
      {rest.map(([k, v]) => (
        <StatOrBadge key={k} text={v} />
      ))}
      {story && (
        <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.75, color: "var(--dim)" }}>
          <GlossaryText text={story} />
        </p>
      )}
    </div>
  );
}

function CategoryBlock({ category }: { category: Category }) {
  const title = typeof category.category_title === "string" ? category.category_title : null;
  const subItems = Object.entries(category).filter(
    ([k, v]) => k.startsWith("sub_") && isSubItem(v)
  ) as [string, SubItem][];

  return (
    <div>
      {title && <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4, color: "var(--accent)" }}>{title}</div>}
      <div>
        {subItems.map(([k, item]) => (
          <SubItemCard key={k} item={item} />
        ))}
      </div>
    </div>
  );
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function eok(n: number | null): string {
  return n !== null ? `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}억원` : "-";
}

// finance_py.py가 나중에 추가한 verified_financials(실측 매출/영업이익/
// 재무상태표/현금흐름 수치, rawJson 최상위)를 표 대신 라벨-값 줄글로
// 간단히 보여준다 — 이미 있는 financial_analysis 6항목(서술 위주)과
// 성격이 겹치지 않게, 여긴 "검증된 숫자"만 짧게 앞에 놓는다.
function VerifiedFinancialsPanel({ data }: { data: Record<string, unknown> }) {
  const revenue = isSubItem(data.revenue) ? data.revenue : null;
  const op = isSubItem(data.operating_profit) ? data.operating_profit : null;
  const bs = isSubItem(data.balance_sheet) ? data.balance_sheet : null;
  const cf = isSubItem(data.cash_flow) ? data.cash_flow : null;
  if (!revenue && !op && !bs && !cf) return null;

  const rows: { label: string; value: React.ReactNode }[] = [];

  if (revenue) {
    const growth = numOrNull(revenue.growth_rate_pct);
    rows.push({
      label: "매출액",
      value: (
        <>
          {strOrNull(revenue.previous_year) ?? ""}년 {eok(numOrNull(revenue.previous_eok))} → {strOrNull(revenue.current_year) ?? ""}
          년 {eok(numOrNull(revenue.current_eok))}
          {growth !== null && (
            <span style={{ marginLeft: 6, color: chgColorVar(growth), fontWeight: 700 }}>{formatChg(growth)}</span>
          )}
        </>
      ),
    });
  }
  if (op) {
    const prevM = numOrNull(op.previous_margin_pct);
    const curM = numOrNull(op.current_margin_pct);
    const changePp = numOrNull(op.margin_change_pp);
    rows.push({
      label: "영업이익",
      value: (
        <>
          {eok(numOrNull(op.previous_eok))}
          {prevM !== null ? `(${prevM.toFixed(1)}%)` : ""} → {eok(numOrNull(op.current_eok))}
          {curM !== null ? `(${curM.toFixed(1)}%)` : ""}
          {changePp !== null && (
            <span style={{ marginLeft: 6, color: chgColorVar(changePp), fontWeight: 700 }}>
              {changePp >= 0 ? "+" : ""}
              {changePp.toFixed(1)}%p
            </span>
          )}
        </>
      ),
    });
  }
  if (bs) {
    const debtRatio = numOrNull(bs.debt_ratio_pct);
    rows.push({
      label: "재무상태표",
      value: (
        <>
          자산 {eok(numOrNull(bs.assets_eok))} · 부채 {eok(numOrNull(bs.liabilities_eok))} · 자본 {eok(numOrNull(bs.equity_eok))}
          {debtRatio !== null && <span style={{ marginLeft: 6, color: "var(--faint)" }}>(부채비율 {debtRatio.toFixed(1)}%)</span>}
        </>
      ),
    });
  }
  if (cf) {
    const patternType = strOrNull(cf.pattern_type);
    rows.push({
      label: "현금흐름",
      value: (
        <>
          영업 {eok(numOrNull(cf.cf_operating_eok))} · 투자 {eok(numOrNull(cf.cf_investing_eok))} · 재무{" "}
          {eok(numOrNull(cf.cf_financing_eok))}
          {patternType && (
            <span style={{ marginLeft: 6, display: "inline-block" }}>
              <VerdictBadge text={patternType} color="var(--accent)" inline />
            </span>
          )}
        </>
      ),
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 11.5, color: "var(--accent)", marginBottom: 8 }}>📊 실측 재무 수치</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", gap: 10, fontSize: 11.5, lineHeight: 1.6 }}>
            <span style={{ flexShrink: 0, width: 64, color: "var(--faint)", fontWeight: 700 }}>{r.label}</span>
            <span style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// financial_story(턴어라운드·현금흐름·재무안전성 3개 스토리 + 종합결론) —
// 기존 6항목 financial_analysis와 서술 스타일이 비슷하지만 3개로 압축된
// 더 최근 스키마(실측: ISC_095340, 2026-09-21). 둘 다 있으면 둘 다
// 보여준다(하나가 다른 하나의 대체가 아니라 둘 다 유효한 분석이라 굳이
// 하나를 숨길 이유가 없음).
function FinancialStoryPanel({ data }: { data: Record<string, unknown> }) {
  const turnaround = isSubItem(data.turnaround_story) ? data.turnaround_story : null;
  const cashflow = isSubItem(data.cashflow_story) ? data.cashflow_story : null;
  const safety = isSubItem(data.balance_safety_story) ? data.balance_safety_story : null;
  const verdicts = Array.isArray(data.analyst_final_verdict)
    ? (data.analyst_final_verdict as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  const blocks: { title: string; verdict: string | null; body: string | null }[] = [];
  if (turnaround) {
    blocks.push({
      title: "실적 체질 변화",
      verdict: strOrNull(turnaround.verdict),
      body: [strOrNull(turnaround.why_changed), strOrNull(turnaround.sustainability)].filter(Boolean).join(" "),
    });
  }
  if (cashflow) {
    blocks.push({
      title: "현금흐름 패턴",
      verdict: strOrNull(cashflow.pattern_verdict),
      body: strOrNull(cashflow.money_flow_analysis),
    });
  }
  if (safety) {
    blocks.push({ title: "재무 안전성", verdict: strOrNull(safety.safety_verdict), body: strOrNull(safety.story) });
  }
  if (blocks.length === 0 && verdicts.length === 0) return null;

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border2)" }}>
      <div style={{ fontWeight: 700, fontSize: 11.5, color: "var(--accent)", marginBottom: 10 }}>📖 재무 스토리</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: verdicts.length > 0 ? 14 : 0 }}>
        {blocks.map((b) => {
          const color = b.verdict ? verdictColor(b.verdict) : null;
          return (
            <div key={b.title}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{b.title}</span>
                {b.verdict && color && <VerdictBadge text={b.verdict} color={color} inline />}
              </div>
              {b.body && (
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.75, color: "var(--dim)" }}>
                  <GlossaryText text={b.body} />
                </p>
              )}
            </div>
          );
        })}
      </div>
      {verdicts.length > 0 && (
        <div
          style={{
            background: "var(--panel2)",
            border: "1px solid var(--border2)",
            borderRadius: 10,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 11.5, color: "var(--accent)" }}>재무 스토리 종합 결론</div>
          {verdicts.map((v, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text)" }}>
              <GlossaryText text={v} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type CompanyAnalysisData = {
  parsed: Record<string, unknown>;
  reportName: string;
  reportUrl: string;
};

// layout="grid": 종목상세처럼 폭이 넓은 곳(2열). layout="stack": 골구 모달처럼
// 좁은 곳(1열, 세로로 쭉). code/name은 맨 아래 "최근 뉴스·시황이랑
// 맞아떨어지는지" 버튼(market-note-button.tsx)에 필요하다.
export function CompanyAnalysisContent({
  data,
  code,
  name,
  layout = "grid",
  showSourceLink = true,
}: {
  data: CompanyAnalysisData;
  code: string;
  name: string;
  layout?: "grid" | "stack";
  showSourceLink?: boolean;
}) {
  const categories = Object.entries(data.parsed).filter(
    ([k, v]) => k.startsWith("category_") && isSubItem(v)
  ) as [string, Category][];
  const verdicts = Array.isArray(data.parsed.master_analyst_final_verdict)
    ? (data.parsed.master_analyst_final_verdict as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  return (
    <div>
      {showSourceLink && (
        <a
          href={data.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover-accent-border"
          style={{
            display: "inline-block",
            marginBottom: 14,
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            color: "var(--faint)",
            textDecoration: "none",
          }}
        >
          출처: {data.reportName} · DART 원문 보기 ›
        </a>
      )}

      {verdicts.length > 0 && (
        <div
          style={{
            background: "var(--panel2)",
            border: "1px solid var(--border2)",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 11.5, color: "var(--accent)" }}>종합 결론</div>
          {verdicts.map((v, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text)" }}>
              <GlossaryText text={v} />
            </div>
          ))}
        </div>
      )}

      <div style={layout === "grid" ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 } : { display: "flex", flexDirection: "column", gap: 4 }}>
        {categories.map(([k, cat]) => (
          <CategoryBlock key={k} category={cat} />
        ))}
      </div>

      {hasFinancialAnalysis(data.parsed) && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border2)" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10, color: "var(--accent)" }}>III. 재무 분석</div>
          <FinancialAnalysisContent
            data={{
              parsed: data.parsed.financial_analysis as Record<string, unknown>,
              reportName: data.reportName,
              reportUrl: data.reportUrl,
              verifiedFinancials: isSubItem(data.parsed.verified_financials) ? data.parsed.verified_financials : null,
              financialStory: isSubItem(data.parsed.financial_story) ? data.parsed.financial_story : null,
            }}
            showSourceLink={false}
          />
        </div>
      )}

      <MarketNoteButton code={code} name={name} />
    </div>
  );
}

// 재무 분석(finance_py.py가 채워주는 financial_analysis) 전용 렌더링 —
// "재무는 표까지 해서 한눈에 보이게" 요청에 맞춰, 6개 항목 · 판정을 한
// 표로 먼저 보여주고 그 아래 항목별 상세(수치·해설)를 카드로 붙인다.
// company-analysis-render.tsx에 두는 이유는 SubItemCard/VerdictBadge 등
// 이미 있는 조각을 그대로 재사용하기 위함 — financial_analysis는
// category_1/2와 키 이름 규칙(title vs sub_title 등)만 조금 다를 뿐 구조가
// 같다.
export type FinancialAnalysisData = {
  parsed: Record<string, unknown>; // financial_analysis 객체 자체
  reportName: string;
  reportUrl: string;
  // verified_financials/financial_story는 financial_analysis 안이 아니라
  // rawJson 최상위에 형제로 들어있는 필드라(lib/field-detail.ts가 따로
  // 뽑아준다) 별도 prop으로 받는다 — 둘 다 optional(옛 스키마 파일엔 없음).
  verifiedFinancials?: Record<string, unknown> | null;
  financialStory?: Record<string, unknown> | null;
};

export function hasFinancialAnalysis(parsed: Record<string, unknown>): boolean {
  return isSubItem(parsed.financial_analysis);
}

export function FinancialAnalysisContent({ data, showSourceLink = true }: { data: FinancialAnalysisData; showSourceLink?: boolean }) {
  const dimensions = Object.entries(data.parsed).filter(
    ([k, v]) => k !== "financial_report_name" && k !== "financial_report_url" && k !== "analyst_financial_summary" && isSubItem(v)
  ) as [string, SubItem][];
  const summary = Array.isArray(data.parsed.analyst_financial_summary)
    ? (data.parsed.analyst_financial_summary as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  return (
    <div>
      {showSourceLink && (
        <a
          href={data.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover-accent-border"
          style={{
            display: "inline-block",
            marginBottom: 14,
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            color: "var(--faint)",
            textDecoration: "none",
          }}
        >
          출처: {data.reportName} · DART 원문 보기 ›
        </a>
      )}

      {summary.length > 0 && (
        <div
          style={{
            background: "var(--panel2)",
            border: "1px solid var(--border2)",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 11.5, color: "var(--accent)" }}>재무 종합 결론</div>
          {summary.map((v, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text)" }}>
              <GlossaryText text={v} />
            </div>
          ))}
        </div>
      )}

      {data.verifiedFinancials && <VerifiedFinancialsPanel data={data.verifiedFinancials} />}

      {dimensions.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 18 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border2)" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--faint)", fontWeight: 600 }}>분석 항목</th>
                <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--faint)", fontWeight: 600 }}>판정</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map(([k, item]) => {
                const title = typeof item.title === "string" ? item.title : k;
                const verdict = findVerdictField(item);
                const color = verdict ? verdictColor(verdict) : null;
                return (
                  <tr key={k} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px", color: "var(--text)" }}>{title}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {verdict && color ? <VerdictBadge text={verdict} color={color} inline /> : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {dimensions.map(([k, item]) => (
          <SubItemCard key={k} item={item} />
        ))}
      </div>

      {data.financialStory && <FinancialStoryPanel data={data.financialStory} />}
    </div>
  );
}

export function parseCompanyAnalysisJson(rawJson: string): Record<string, unknown> | null {
  try {
    return JSON.parse(rawJson);
  } catch {
    return null;
  }
}
