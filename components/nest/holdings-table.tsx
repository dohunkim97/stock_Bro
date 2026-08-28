"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HoldingWithLiveData, RiskStatus } from "@/lib/portfolio";
import { chgColorVar, formatChg } from "@/lib/format";

type SearchableStock = { code: string; name: string; market: string };

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 20,
};

// 위험 상태는 상승/하락(--up/--down) 색 규칙과 무관한 "경고 신호"라, 굳이
// 새 CSS 변수를 안 만들고 이미 있는 --accent(주의)와 --up(위험, 이 앱의
// 색상표에서 이미 붉은 톤이라 "위험"의 직관과도 맞음)을 재사용한다.
function riskColor(status: RiskStatus | null): string {
  if (status === "손절가 이탈") return "var(--up)";
  if (status === "손절가 근접") return "var(--accent)";
  return "var(--faint)";
}

function riskBg(status: RiskStatus | null): string {
  if (status === "손절가 이탈") return "var(--up-soft)";
  if (status === "손절가 근접") return "var(--accent-soft)";
  return "var(--panel2)";
}

const inputStyle: React.CSSProperties = {
  height: 34,
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "0 10px",
  fontFamily: "var(--sans)",
  fontSize: 12.5,
  outline: "none",
};

function AddHoldingForm({ stocks, onAdded }: { stocks: SearchableStock[]; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchableStock | null>(null);
  const [open, setOpen] = useState(false);
  const [buyPrice, setBuyPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q ? stocks.filter((s) => s.name.toLowerCase().includes(q) || s.code.includes(q)).slice(0, 8) : [];

  async function submit() {
    setError(null);
    const name = selected?.name ?? query.trim();
    const price = Number(buyPrice);
    const qty = Number(quantity);
    if (!name) return setError("종목을 선택해줘");
    if (!Number.isFinite(price) || price <= 0) return setError("매수가를 입력해줘");
    if (!Number.isFinite(qty) || qty <= 0) return setError("수량을 입력해줘");

    setBusy(true);
    try {
      const res = await fetch("/api/portfolio/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code: selected?.code, buyPrice: price, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "추가하지 못했어요");
        return;
      }
      setQuery("");
      setSelected(null);
      setBuyPrice("");
      setQuantity("");
      onAdded();
    } catch {
      setError("추가하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", width: 180 }}>
          <input
            value={selected ? selected.name : query}
            onChange={(e) => {
              setSelected(null);
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="종목명 검색"
            style={{ ...inputStyle, width: "100%" }}
          />
          {open && filtered.length > 0 && !selected && (
            <>
              <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 55 }} />
              <div
                style={{
                  position: "absolute",
                  top: 38,
                  left: 0,
                  width: 220,
                  maxHeight: 260,
                  overflowY: "auto",
                  background: "var(--panel)",
                  border: "1px solid var(--border2)",
                  borderRadius: 10,
                  boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
                  zIndex: 60,
                }}
              >
                {filtered.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => {
                      setSelected(s);
                      setOpen(false);
                    }}
                    className="hover-row"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      color: "var(--text)",
                      fontSize: 12.5,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>{s.code}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <input
          value={buyPrice}
          onChange={(e) => setBuyPrice(e.target.value)}
          placeholder="매수가"
          inputMode="numeric"
          style={{ ...inputStyle, width: 90, fontFamily: "var(--mono)" }}
        />
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="수량"
          inputMode="numeric"
          style={{ ...inputStyle, width: 70, fontFamily: "var(--mono)" }}
        />
        <button
          onClick={submit}
          disabled={busy}
          style={{
            height: 34,
            padding: "0 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "#0a0d13",
            fontWeight: 700,
            fontSize: 12.5,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "추가 중..." : "+ 종목 추가"}
        </button>
      </div>
      {error && <div style={{ fontSize: 11.5, color: "var(--up)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

export function HoldingsTable({ initialHoldings, stocks }: { initialHoldings: HoldingWithLiveData[]; stocks: SearchableStock[] }) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function remove(id: string) {
    setRemovingId(id);
    try {
      await fetch(`/api/portfolio/holdings/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section style={panelStyle}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>보유 종목 관리</div>

      <AddHoldingForm stocks={stocks} onAdded={() => router.refresh()} />

      {initialHoldings.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12.5, color: "var(--faint)" }}>
          아직 등록된 보유 종목이 없어요. 위에서 추가해보세요.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["종목명", "매수가", "현재가", "등락률", "평가금액", "자동 손절가", "AI 목표가", "상태", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "var(--faint)", fontWeight: 600, fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialHoldings.map((h) => (
                <tr key={h.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px" }}>
                    <Link href={`/stock?code=${h.code}`} style={{ fontWeight: 700, color: "var(--text)" }}>
                      {h.name}
                    </Link>
                  </td>
                  <td style={{ padding: "10px", fontFamily: "var(--mono)" }}>{Math.round(h.buyPrice).toLocaleString()}</td>
                  <td style={{ padding: "10px", fontFamily: "var(--mono)" }}>
                    {h.currentPrice !== null ? Math.round(h.currentPrice).toLocaleString() : "-"}
                  </td>
                  <td style={{ padding: "10px", fontFamily: "var(--mono)", fontWeight: 700, color: h.changePct !== null ? chgColorVar(h.changePct) : "var(--faint)" }}>
                    {h.changePct !== null ? formatChg(h.changePct) : "-"}
                  </td>
                  <td style={{ padding: "10px", fontFamily: "var(--mono)" }}>
                    {h.valuation !== null ? Math.round(h.valuation).toLocaleString() : "-"}
                  </td>
                  <td style={{ padding: "10px", fontFamily: "var(--mono)", color: "var(--dim)" }}>
                    {h.stopLoss !== null ? Math.round(h.stopLoss).toLocaleString() : "-"}
                  </td>
                  <td style={{ padding: "10px", fontFamily: "var(--mono)", color: "var(--dim)" }}>
                    {h.target !== null ? Math.round(h.target).toLocaleString() : "-"}
                  </td>
                  <td style={{ padding: "10px" }}>
                    {h.riskStatus && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 20,
                          whiteSpace: "nowrap",
                          color: riskColor(h.riskStatus),
                          background: riskBg(h.riskStatus),
                        }}
                      >
                        {h.riskStatus}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px" }}>
                    <button
                      onClick={() => remove(h.id)}
                      disabled={removingId === h.id}
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
