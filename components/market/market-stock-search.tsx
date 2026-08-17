"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type SearchableStock = { code: string; name: string; market: string };

export function MarketStockSearch({ stocks }: { stocks: SearchableStock[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? stocks.filter((s) => s.name.toLowerCase().includes(q) || s.code.includes(q)).slice(0, 8)
    : [];

  const goToStock = (code: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/stock?code=${code}`);
  };

  return (
    <div style={{ position: "relative", width: 260, flexShrink: 0 }}>
      <span
        style={{
          position: "absolute",
          left: 13,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 13,
          color: "var(--faint)",
          pointerEvents: "none",
        }}
      >
        🔍
      </span>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered[0]) goToStock(filtered[0].code);
        }}
        placeholder="종목명 또는 코드 검색"
        style={{
          width: "100%",
          height: 38,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          borderRadius: 10,
          padding: "0 14px 0 34px",
          fontFamily: "var(--sans)",
          fontSize: 13,
          outline: "none",
        }}
      />

      {open && filtered.length > 0 && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 55 }}
          />
          <div
            style={{
              position: "absolute",
              top: 44,
              left: 0,
              width: "100%",
              maxHeight: 320,
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
                onClick={() => goToStock(s.code)}
                className="hover-row"
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
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
                    marginLeft: "auto",
                  }}
                >
                  {s.market}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
