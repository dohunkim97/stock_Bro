"use client";

// 매매일지 — 채팅으로 "매수/매도했어"라고 말한 사건이 쌓이는 패널. 여기선
// 숫자를 새로 계산하지 않고(lib/trade-journal.ts가 이미 계산해 저장한
// realizedPnl 등을 그대로 보여줌), 삭제만 가능하게 뒀다 — 직접 수정은
// 아직 범위 밖(채팅으로 잘못 기록됐으면 지우고 다시 말하는 쪽으로 유도).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatWon } from "@/lib/format";

export type TradeJournalRow = {
  id: string;
  code: string;
  name: string;
  action: string; // "BUY" | "SELL"
  date: string;
  quantity: number;
  price: number;
  amount: number;
  costBasis: number | null;
  realizedPnl: number | null;
  realizedPnlPct: number | null;
  holdingDays: number | null;
};

export type RealizedSummary = { count: number; totalPnl: number; winRate: number | null };

const panelStyle: React.CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 };

function ActionBadge({ action }: { action: string }) {
  const buy = action === "BUY";
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 20,
        color: buy ? "var(--down)" : "var(--up)",
        background: buy ? "var(--down-soft)" : "var(--up-soft)",
      }}
    >
      {buy ? "매수" : "매도"}
    </span>
  );
}

export function TradeJournalPanel({ rows, summary }: { rows: TradeJournalRow[]; summary: RealizedSummary }) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function remove(id: string) {
    setRemovingId(id);
    try {
      await fetch(`/api/finance/trades/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>📓 매매 리포트</div>
        {summary.count > 0 && (
          <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: "var(--dim)" }}>
            <span>
              실현손익 합계{" "}
              <b style={{ fontFamily: "var(--mono)", color: summary.totalPnl >= 0 ? "var(--up)" : "var(--down)" }}>
                {summary.totalPnl >= 0 ? "+" : ""}
                {formatWon(Math.abs(summary.totalPnl))}
              </b>
            </span>
            {summary.winRate !== null && (
              <span>
                승률 <b style={{ fontFamily: "var(--mono)" }}>{summary.winRate.toFixed(0)}%</b>
              </span>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--faint)", textAlign: "center", padding: "20px 0" }}>
          아직 기록이 없어요. 골구 채팅/텔레그램에 "○○ 10주 샀어", "○○ 처분했어"라고 말하면 여기 쌓여요.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["날짜", "", "종목", "수량", "가격", "실현손익", "보유기간", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "var(--faint)", fontWeight: 600, fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px", fontFamily: "var(--mono)", color: "var(--faint)" }}>{r.date.slice(5)}</td>
                  <td style={{ padding: "10px" }}>
                    <ActionBadge action={r.action} />
                  </td>
                  <td style={{ padding: "10px", fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: "10px", fontFamily: "var(--mono)" }}>{r.quantity.toLocaleString()}주</td>
                  <td style={{ padding: "10px", fontFamily: "var(--mono)" }}>{Math.round(r.price).toLocaleString()}</td>
                  <td
                    style={{
                      padding: "10px",
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      color: r.realizedPnl === null ? "var(--faint)" : r.realizedPnl >= 0 ? "var(--up)" : "var(--down)",
                    }}
                  >
                    {r.realizedPnl === null
                      ? "-"
                      : `${r.realizedPnl >= 0 ? "+" : ""}${formatWon(Math.abs(r.realizedPnl))}${
                          r.realizedPnlPct !== null ? ` (${r.realizedPnlPct >= 0 ? "+" : ""}${r.realizedPnlPct.toFixed(1)}%)` : ""
                        }`}
                  </td>
                  <td style={{ padding: "10px", color: "var(--dim)" }}>{r.holdingDays !== null ? `${r.holdingDays}일` : "-"}</td>
                  <td style={{ padding: "10px" }}>
                    <button
                      onClick={() => remove(r.id)}
                      disabled={removingId === r.id}
                      style={{ border: "none", background: "transparent", color: "var(--faint)", cursor: "pointer", fontSize: 12 }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
