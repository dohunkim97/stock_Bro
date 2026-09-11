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

// verdict성 필드(짧고 평가 어휘 위주)와 stats성 필드(길고 수치 나열)를
// 구분 — 짧은(대략 20자 이하) 문자열이면서 평가 색이 잡히면 뱃지로,
// 나머지는 그냥 줄글로.
function StatOrBadge({ text }: { text: string }) {
  const color = text.length <= 22 ? verdictColor(text) : null;
  if (color) {
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
          marginTop: 4,
        }}
      >
        {text}
      </span>
    );
  }
  return (
    <div style={{ fontSize: 11.5, color: "var(--text)", lineHeight: 1.6, marginTop: 4, fontFamily: "var(--mono)" }}>
      {text}
    </div>
  );
}

function SubItemCard({ item }: { item: SubItem }) {
  const title = typeof item.sub_title === "string" ? item.sub_title : null;
  const story = typeof item.story === "string" ? item.story : null;
  const rest = Object.entries(item).filter(
    ([k, v]) => k !== "sub_title" && k !== "story" && typeof v === "string" && v.length > 0
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

      <MarketNoteButton code={code} name={name} />
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
