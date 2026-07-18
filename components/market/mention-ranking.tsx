import Link from "next/link";
import { chgColorVar, formatChg } from "@/lib/format";
import type { MentionRow } from "@/lib/mention-ranking";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  overflow: "hidden",
};

export function MentionRanking({ rows, days }: { rows: MentionRow[]; days: number }) {
  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "16px 18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>언급 많은 종목</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)" }}>
          최근 {days}일 랭킹 등장 빈도
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "22px 18px", textAlign: "center", fontSize: 13, color: "var(--faint)" }}>
          최근 {days}일간 입력된 종목이 없어요
        </div>
      ) : (
        rows.map((r, i) => (
          <Link
            key={r.name}
            href={r.code ? `/stock?code=${r.code}` : "/stock"}
            className="hover-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 18px",
              borderBottom: "1px solid var(--border)",
              fontSize: 13.5,
            }}
          >
            <span style={{ fontFamily: "var(--mono)", color: "var(--faint)", fontSize: 12, width: 16 }}>
              {i + 1}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{r.name}</span>{" "}
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>
                {r.sector}
              </span>
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)" }}>
              {r.count}회 등장
            </span>
            <span
              style={{
                textAlign: "right",
                fontFamily: "var(--mono)",
                fontWeight: 600,
                fontSize: 12.5,
                width: 64,
                color: chgColorVar(r.avgChangePct),
              }}
            >
              {formatChg(r.avgChangePct)}
            </span>
          </Link>
        ))
      )}
    </section>
  );
}
