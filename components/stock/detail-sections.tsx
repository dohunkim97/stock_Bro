import { fetchNews } from "@/lib/naver-news";
import { NewsList } from "@/components/news-list";
import { EarningsAnalysis } from "./earnings-analysis";
import { InvestorTrend } from "./investor-trend";

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
      {/* 기업실적분석 + 투자자별 매매동향 — 기업실적분석이 보통 더 길어서, 투자자별
          매매동향이 stretch로 그 높이에 맞춰 늘어난다(둘 다 내부 스크롤 없이 자연스러운
          콘텐츠 높이라 TOP종목 때처럼 JS 측정까지는 필요 없다). */}
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 20, alignItems: "stretch" }}>
        <EarningsAnalysis code={code} />
        <InvestorTrend code={code} />
      </div>

      {/* 사업/제품별 매출 비중 */}
      <section style={panelStyle}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>사업·제품별 매출 비중</span>
        <div style={infoNoteStyle}>
          공시 데이터에는 종목별 사업부문·제품별 매출 비중이 표 형태로 제공되지 않아서, 이 항목은
          아직 지원하지 않아요. 전체 매출액은 위 기업실적분석에서 확인할 수 있어요.
        </div>
      </section>

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
