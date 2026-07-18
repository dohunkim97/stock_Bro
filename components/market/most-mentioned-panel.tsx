"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { chgColorVar, formatChg } from "@/lib/format";
import type { MentionRow } from "@/lib/mention-ranking";

const DEFAULT_COUNT = 10;

function Row({ r, rank }: { r: MentionRow; rank: number }) {
  return (
    <Link
      href={r.code ? `/stock?code=${r.code}` : "/stock"}
      className="hover-accent-border"
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "11px 13px",
        marginBottom: 7,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", width: 16 }}>{rank}</span>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>{r.code ?? "-"}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)" }}>{r.count}회 등장</span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontWeight: 700,
            fontSize: 13,
            width: 60,
            textAlign: "right",
            color: chgColorVar(r.avgChangePct),
          }}
        >
          {formatChg(r.avgChangePct)}
        </span>
      </span>
    </Link>
  );
}

export function MostMentionedPanel({ rows, weekLabel }: { rows: MentionRow[]; weekLabel: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const visible = rows.slice(0, DEFAULT_COUNT);

  return (
    <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--faint)", fontFamily: "var(--mono)" }}>
          이번 주 가장 많이 언급된 종목
        </div>
        {rows.length > DEFAULT_COUNT && (
          <button
            onClick={() => setModalOpen(true)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "5px 9px",
              color: "var(--dim)",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            더보기 (전체 {rows.length})
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: "12px 0", fontSize: 13, color: "var(--faint)" }}>
          {weekLabel}에 입력된 종목이 없어요
        </div>
      ) : (
        visible.map((r, i) => <Row key={r.name} r={r} rank={i + 1} />)
      )}

      <Link
        href={visible[0]?.code ? `/stock?code=${visible[0].code}` : "/stock"}
        style={{
          display: "block",
          width: "100%",
          marginTop: 6,
          padding: 11,
          background: "var(--accent)",
          color: "#0a0d13",
          border: "none",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 13.5,
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        {visible[0]?.name ?? "종목"} 상세 분석 보기 →
      </Link>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`이번 주 가장 많이 언급된 종목 · 전체 ${rows.length}종목`}
      >
        {rows.map((r, i) => (
          <Row key={r.name} r={r} rank={i + 1} />
        ))}
      </Modal>
    </div>
  );
}
