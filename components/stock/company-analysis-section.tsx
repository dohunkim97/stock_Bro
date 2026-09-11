import { prisma } from "@/lib/prisma";
import { CompanyAnalysisContent, parseCompanyAnalysisJson } from "./company-analysis-render";

// scripts/watch-company-analysis.ts가 로컬 "기업분석" 프로그램의 결과 JSON을
// 감시해서 올려주는 CompanyAnalysis 레코드를 종목상세 페이지에 펼친다.
// 실제 렌더링은 company-analysis-render.tsx(DB 접근 없는 순수 조각들)가
// 맡는다 — 골구 사업요약 모달(components/bro/field-detail-modal.tsx)도
// 같은 데이터가 있으면 그 조각들을 그대로 재사용한다.

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "18px 20px",
};

export async function CompanyAnalysisSection({ code }: { code: string }) {
  const row = await prisma.companyAnalysis.findUnique({ where: { code } });
  if (!row) return null; // 아직 분석되지 않은 종목은 섹션 자체를 안 띄운다(빈 자리 대신)

  const parsed = parseCompanyAnalysisJson(row.rawJson);
  if (!parsed) return null;

  return (
    <section style={panelStyle}>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>🔎 AI 기업분석</span>
      </div>
      <CompanyAnalysisContent
        data={{ parsed, reportName: row.reportName, reportUrl: row.reportUrl }}
        code={row.code}
        name={row.name}
        layout="grid"
      />
    </section>
  );
}
