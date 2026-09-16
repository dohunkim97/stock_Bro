"use client";

// 판정 배지·전문 회계 용어를 클릭(또는 호버)하면 짧은 설명 팝오버를 띄우는
// 컴포넌트. company-analysis-render.tsx(서버 컴포넌트 트리에서도 쓰임)와
// field-detail-modal.tsx(클라이언트 모달) 양쪽에서 재사용하는 리프
// 컴포넌트라 여기만 "use client" — market-note-button.tsx와 같은 패턴.
//
// 모달(components/ui/modal.tsx)의 바깥 박스가 transform: translate(...)로
// 가운데 정렬돼 있어서, 그 안에서 position: fixed를 그대로 쓰면 뷰포트가
// 아니라 그 transform 박스가 기준이 돼버린다(CSS 스펙상 transform이 fixed
// 자손의 containing block이 됨) — 그래서 팝오버를 document.body에 직접
// portal로 그려서 모달의 overflow/transform을 완전히 벗어나게 한다.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { splitByGlossaryTerms } from "@/lib/finance-glossary";

const POPOVER_WIDTH = 260;
const VIEWPORT_MARGIN = 12;

export function GlossaryTerm({
  term,
  explanation,
  children,
  bare = false,
}: {
  term: string;
  explanation: string;
  children: React.ReactNode;
  bare?: boolean; // true면 배지처럼 트리거 쪽이 이미 스타일을 갖고 있어 밑줄을 추가하지 않는다
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "above" | "below" } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false); // 스크롤되면 위치가 안 맞으니 그냥 닫는다(재계산보다 단순)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function show() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom;
    const placement: "above" | "below" = spaceBelow < 140 && rect.top > 140 ? "above" : "below";
    let left = rect.left;
    if (left + POPOVER_WIDTH > vw - VIEWPORT_MARGIN) left = vw - POPOVER_WIDTH - VIEWPORT_MARGIN;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    setPos({ top: placement === "below" ? rect.bottom + 6 : rect.top - 6, left, placement });
    setOpen(true);
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
        style={{
          cursor: "help",
          ...(bare ? {} : { borderBottom: "1px dotted var(--faint)" }),
        }}
      >
        {children}
      </span>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            style={{
              position: "fixed",
              ...(pos.placement === "below"
                ? { top: pos.top }
                : { top: undefined, bottom: window.innerHeight - pos.top }),
              left: pos.left,
              width: POPOVER_WIDTH,
              zIndex: 500,
              background: "var(--panel)",
              border: "1px solid var(--border2)",
              borderRadius: 10,
              padding: "10px 12px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
              fontSize: 11.5,
              lineHeight: 1.6,
              color: "var(--text)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--accent)", fontSize: 11.5 }}>{term}</div>
            {explanation}
          </div>,
          document.body
        )}
    </>
  );
}

// story/verdict 같은 줄글 속에 섞인 용어(예: "이자보상배율")만 골라서
// GlossaryTerm으로 감싸고 나머지는 그대로 둔다 — company-analysis-render.tsx
// 여러 곳(SubItemCard의 story, 종합 결론 문단 등)에서 재사용.
export function GlossaryText({ text }: { text: string }) {
  const segments = splitByGlossaryTerms(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.glossary ? (
          <GlossaryTerm key={i} term={seg.glossary.term} explanation={seg.glossary.explanation}>
            {seg.text}
          </GlossaryTerm>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}
