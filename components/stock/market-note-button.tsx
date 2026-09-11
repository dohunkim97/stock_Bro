"use client";

import { useState } from "react";

// AI 기업분석(공시 시점 펀더멘털 결론)을 최신 뉴스·오늘 시황과 한 번 더
// 엮어보는 버튼 — 다른 필드들과 같은 클릭-지연로딩 패턴
// (/api/bro/company-analysis-market-note, lib/field-detail.ts의
// getCompanyAnalysisMarketNote). CompanyAnalysisContent(종목상세 서버
// 컴포넌트, 골구 모달 클라이언트 컴포넌트 양쪽)가 렌더링하는 유일한
// 인터랙티브 조각이라 별도 파일로 뺐다 — 그 자체는 상태가 없어야 하므로.
export function MarketNoteButton({ code, name }: { code: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function handleClick() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (content !== null) return; // 이미 불러온 적 있으면 재요청 안 함
    setLoading(true);
    setFailed(false);
    fetch(`/api/bro/company-analysis-market-note?code=${code}&name=${encodeURIComponent(name)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => setContent(data.content))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={handleClick}
        className="hover-accent-border"
        style={{
          background: "var(--panel2)",
          border: "1px solid var(--border2)",
          borderRadius: 8,
          padding: "7px 12px",
          fontSize: 11.5,
          fontWeight: 700,
          color: "var(--accent)",
          cursor: "pointer",
        }}
      >
        📰 최근 뉴스·오늘 시황이랑 맞아떨어지는지 보기 {open ? "▴" : "▾"}
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            background: "var(--panel2)",
            border: "1px solid var(--border2)",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 12,
            lineHeight: 1.75,
            color: "var(--text)",
          }}
        >
          {loading && <span style={{ color: "var(--faint)" }}>불러오는 중...</span>}
          {!loading && failed && <span style={{ color: "var(--faint)" }}>불러오지 못했어요. 다시 눌러주세요.</span>}
          {!loading && !failed && content}
        </div>
      )}
    </div>
  );
}
