import { Suspense } from "react";
import { fetchNews } from "@/lib/naver-news";
import { fetchDartBusinessBundle } from "@/lib/dart";
import { NewsList } from "@/components/news-list";
import { EarningsAnalysis } from "./earnings-analysis";
import { InvestorTrend } from "./investor-trend";
import { CompanyAnalysisSection } from "./company-analysis-section";
import { RevenueMixDonut, extractRevenueMix } from "./revenue-mix-donut";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "18px 20px",
};

const infoNoteStyle: React.CSSProperties = {
  padding: "16px 0",
  fontSize: 13,
  color: "var(--faint)",
  lineHeight: 1.6,
};

// 회사마다 표가 여러 개 걸릴 수 있어서(매출 비중표 외에 가격추이·생산능력
// 등도 숫자를 포함) 그중 "매출"·"비중"·"비율"이 헤더에 있는 표를 우선
// 고른다 — 없으면 행이 가장 많은 표(보통 품목별로 세분화된 표)를 쓴다.
function pickPrimaryTable(tables: string[][][]): string[][] | null {
  if (tables.length === 0) return null;
  const bySalesHeader = tables.find((t) => /매출|비중|비율/.test(t[0]?.join(" ") ?? ""));
  if (bySalesHeader) return bySalesHeader;
  return tables.reduce((best, t) => (t.length > best.length ? t : best), tables[0]);
}

function DartProductsTable({ rows }: { rows: string[][] }) {
  return (
    <div style={{ overflowX: "auto", marginTop: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: "6px 10px",
                    fontWeight: i === 0 ? 700 : 400,
                    color: i === 0 ? "var(--faint)" : "var(--text)",
                    fontFamily: /^[\d,.%△()-]+$/.test(cell) ? "var(--mono)" : undefined,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// DART document.xml 왕복이 (실측) Vercel 프로덕션 네트워크 경로에서 고정적
//으로 ~18~20초 걸린다(lib/dart.ts BUNDLE_BUDGET_MS 주석 참고) — 이걸
// DetailSections 본문에서 그냥 await하면 페이지 전체가 그만큼 늦게
// 뜬다(기업실적분석·투자자매매동향·뉴스는 전부 훨씬 빠른데 같이 묶여서
// 느려짐). 그래서 이 섹션만 별도 async 컴포넌트로 떼어 Suspense로
// 감싸고, 나머지 섹션은 먼저 스트리밍되게 한다.
async function BusinessMixSection({ code }: { code: string }) {
  const dartBundle = await fetchDartBusinessBundle(code);
  const primaryTable = dartBundle ? pickPrimaryTable(dartBundle.raw.productsTables) : null;
  // 도넛은 표에서 뽑은 숫자가 그럴듯할 때만(파싱 신뢰도 체크는
  // extractRevenueMix 안에서) — 못 믿을 땐 표만 보여주는 게 맞다.
  const revenueMix = primaryTable ? extractRevenueMix(primaryTable) : [];

  return (
    <section style={panelStyle}>
      <span style={{ fontWeight: 700, fontSize: 14.5 }}>사업·제품별 매출 비중</span>
      {primaryTable ? (
        <>
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", marginTop: 4 }}>
            {revenueMix.length > 0 && (
              <div style={{ flexShrink: 0 }}>
                <RevenueMixDonut segments={revenueMix} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 260 }}>
              <DartProductsTable rows={primaryTable} />
            </div>
          </div>
          {dartBundle && (
            <a
              href={dartBundle.dartUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover-accent-border"
              style={{ display: "inline-block", marginTop: 8, fontSize: 10.5, color: "var(--faint)", textDecoration: "none" }}
            >
              📄 출처: {dartBundle.reportName} ({dartBundle.reportDate.slice(0, 4)}.{dartBundle.reportDate.slice(4, 6)}.
              {dartBundle.reportDate.slice(6, 8)}) · DART 공시 원문 보기 ›
            </a>
          )}
        </>
      ) : (
        <div style={infoNoteStyle}>
          DART 공시(사업/반기/분기보고서)에서 사업부문·제품별 매출 비중 표를 아직 찾지 못했어요. 전체
          매출액은 위 기업실적분석에서 확인할 수 있어요.
        </div>
      )}
    </section>
  );
}

function BusinessMixSkeleton() {
  return (
    <section style={panelStyle}>
      <span style={{ fontWeight: 700, fontSize: 14.5 }}>사업·제품별 매출 비중</span>
      <div style={infoNoteStyle}>DART 공시에서 매출 비중 표를 불러오는 중이에요…</div>
    </section>
  );
}

export async function DetailSections({
  stockName,
  code,
  market,
}: {
  stockName: string;
  code: string;
  market: string;
}) {
  const news = await fetchNews(stockName);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* AI 기업분석 — 사용자가 로컬에서 돌리는 별도 프로그램(DART 공시 기반
          "족보/펀더멘털" 심층 분석)의 결과. scripts/watch-company-analysis.ts가
          그 프로그램이 만든 JSON 파일을 실시간으로 DB에 올려두면 여기서 읽는다
          (components/stock/company-analysis-section.tsx). 아직 분석되지 않은
          종목은 섹션 자체가 안 뜬다(null 반환). */}
      <CompanyAnalysisSection code={code} />

      {/* 기업실적분석 + 투자자별 매매동향 — 기업실적분석이 보통 더 길어서, 투자자별
          매매동향이 stretch로 그 높이에 맞춰 늘어난다(둘 다 내부 스크롤 없이 자연스러운
          콘텐츠 높이라 TOP종목 때처럼 JS 측정까지는 필요 없다). */}
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 20, alignItems: "stretch" }}>
        <EarningsAnalysis code={code} />
        <InvestorTrend code={code} />
      </div>

      {/* 사업/제품별 매출 비중 — DART 정기보고서(사업/반기/분기보고서) "2. 주요
          제품 및 서비스" 표를 그대로 가져온다(lib/dart.ts). LLM 요약 없이 원문
          표를 그대로 보여주는 게 이 패널의 취지(사실 그대로)에 더 맞는다. */}
      <Suspense fallback={<BusinessMixSkeleton />}>
        <BusinessMixSection code={code} />
      </Suspense>

      {/* 최근 이슈·뉴스 */}
      <section style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 15 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>최근 이슈 · 뉴스</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
            네이버 뉴스 검색
          </span>
        </div>
        <NewsList items={news} emptyLabel={`${stockName} 관련 최근 뉴스가 없어요`} />
      </section>

      {/* 업종 내 경쟁사 비교 */}
      <section style={panelStyle}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>업종 내 경쟁사 비교</span>
        <div style={infoNoteStyle}>
          같은 업종에 속한 다른 종목을 자동으로 찾아 비교하는 기능은 아직 준비 중이에요. {market} 종목
          검색은 상단 목록 버튼으로 직접 찾아볼 수 있어요.
        </div>
      </section>
    </div>
  );
}
