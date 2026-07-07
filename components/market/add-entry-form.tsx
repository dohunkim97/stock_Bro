"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddEntryForm({
  date,
  listType,
  accentVar,
  accentSoftVar,
  showVolumeField,
}: {
  date: string;
  listType: "volume" | "gainer";
  accentVar: string;
  accentSoftVar: string;
  showVolumeField: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [changePct, setChangePct] = useState("");
  const [volume, setVolume] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          listType,
          name,
          price,
          changePct,
          volume: showVolumeField ? volume : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "추가하지 못했어요");
        return;
      }
      setName("");
      setPrice("");
      setChangePct("");
      setVolume("");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "14px 18px",
        background: "var(--panel2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="종목명 입력"
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="현재가"
          style={{ ...inputStyle, width: 90, fontFamily: "var(--mono)", textAlign: "right" }}
        />
        <input
          value={changePct}
          onChange={(e) => setChangePct(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="등락률(%)"
          style={{ ...inputStyle, width: 90, fontFamily: "var(--mono)", textAlign: "right" }}
        />
        {showVolumeField && (
          <input
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="거래량(만주)"
            style={{ ...inputStyle, width: 100, fontFamily: "var(--mono)", textAlign: "right" }}
          />
        )}
        <button
          onClick={submit}
          disabled={pending}
          style={{
            background: accentSoftVar,
            color: accentVar,
            border: `1px solid ${accentVar}`,
            borderRadius: 8,
            padding: "9px 15px",
            fontWeight: 700,
            fontSize: 13,
            cursor: pending ? "default" : "pointer",
            whiteSpace: "nowrap",
            opacity: pending ? 0.6 : 1,
          }}
        >
          + 추가
        </button>
      </div>
      {error && (
        <span style={{ fontSize: 11.5, color: "var(--down)" }}>{error}</span>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "9px 12px",
  fontFamily: "var(--sans)",
  fontSize: 13,
  outline: "none",
};
