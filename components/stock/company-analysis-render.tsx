import { MarketNoteButton } from "./market-note-button";

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

function VerdictBadge({ text, color, inline = false }: { text: string; color: string; inline?: boolean }) {
  return (
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
    </span>
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
      {text}
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
      {story && <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.75, color: "var(--dim)" }}>{story}</p>}
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
              {v}
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
              {v}
            </div>
          ))}
        </div>
      )}

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
