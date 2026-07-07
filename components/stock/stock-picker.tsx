"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chgColorVar, formatChg } from "@/lib/format";

export type PickerStock = {
  name: string;
  code: string;
  market: string;
  price: string;
  changePct: number;
};

export function StockPicker({
  stocks,
  currentCode,
}: {
  stocks: PickerStock[];
  currentCode: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = stocks.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.code.includes(q)
  );

  const select = (code: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/stock?code=${code}`);
  };

  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, maxWidth: 540 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="hover-accent-border"
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: 10,
            padding: "0 14px",
            height: 42,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ☰ 목록
        </button>
        <div style={{ position: "relative", flex: 1 }}>
          <span
            style={{
              position: "absolute",
              left: 13,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 14,
              color: "var(--faint)",
            }}
          >
            🔍
          </span>
          <input
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder="종목명 또는 종목코드 검색 (예: 삼성전자, 000660)"
            style={{
              width: "100%",
              height: 42,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              borderRadius: 10,
              padding: "0 14px 0 38px",
              fontFamily: "var(--sans)",
              fontSize: 13.5,
              outline: "none",
            }}
          />
        </div>
      </div>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 55 }}
          />
          <div
            style={{
              position: "absolute",
              top: 52,
              left: 0,
              width: 540,
              maxWidth: "100%",
              maxHeight: 380,
              overflowY: "auto",
              background: "var(--panel)",
              border: "1px solid var(--border2)",
              borderRadius: 12,
              boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
              zIndex: 60,
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--faint)",
                borderBottom: "1px solid var(--border)",
                position: "sticky",
                top: 0,
                background: "var(--panel)",
              }}
            >
              국내 주식 · {filtered.length}종목
            </div>
            {filtered.map((s) => (
              <button
                key={s.code}
                onClick={() => select(s.code)}
                className="hover-row"
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "11px 14px",
                  background: s.code === currentCode ? "var(--accent-soft)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
                    {s.code}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--dim)",
                      background: "var(--panel2)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {s.market}
                  </span>
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, textAlign: "right" }}>{s.price}</span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    textAlign: "right",
                    width: 70,
                    color: chgColorVar(s.changePct),
                  }}
                >
                  {formatChg(s.changePct)}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "22px 14px", textAlign: "center", fontSize: 13, color: "var(--faint)" }}>
                검색 결과가 없어요
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
