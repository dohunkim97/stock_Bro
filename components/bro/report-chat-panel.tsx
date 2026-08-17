"use client";

import { useState } from "react";

const CHAT_OPEN_WIDTH = 420;

// 예상 리포트(2번) 위에 겹쳐 뜨는 "대화" 토글 버튼 — 기본은 접힘(리포트가
// 왼쪽 컬럼 전체 폭을 씀), 누르면 오른쪽에 대화창(3번)이 슬라이드로 펼쳐짐.
// 대화창은 항상 마운트된 채로 폭만 0↔420px로 애니메이션되므로(언마운트되지
// 않으므로) 대화 내용은 접었다 펴도 유지된다.
export function ReportChatPanel({ report, chat }: { report: React.ReactNode; chat: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}>
        {report}
        <button
          onClick={() => setChatOpen((v) => !v)}
          title={chatOpen ? "대화창 닫기" : "대화창 열기"}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: chatOpen ? "var(--accent)" : "var(--panel2)",
            color: chatOpen ? "#0a0d13" : "var(--dim)",
            border: `1px solid ${chatOpen ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 20,
            padding: "6px 12px",
            fontSize: 11.5,
            fontWeight: 700,
            fontFamily: "var(--sans)",
            cursor: "pointer",
          }}
        >
          💬 {chatOpen ? "닫기" : "대화"}
        </button>
      </div>

      <div
        style={{
          flex: `0 0 ${chatOpen ? CHAT_OPEN_WIDTH : 0}px`,
          marginLeft: chatOpen ? 12 : 0,
          overflow: "hidden",
          height: "100%",
          transition: "flex-basis .2s ease, margin-left .2s ease",
        }}
      >
        <div style={{ width: CHAT_OPEN_WIDTH, height: "100%" }}>{chat}</div>
      </div>
    </div>
  );
}
