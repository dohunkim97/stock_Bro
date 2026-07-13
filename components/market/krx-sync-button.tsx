"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function KrxSyncButton({ date }: { date: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function sync() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/entries/sync-krx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "동기화에 실패했어요", isError: true });
        return;
      }
      if (data.skipped) {
        setMessage({ text: data.reason ?? "가져올 데이터가 없어요", isError: true });
        return;
      }
      setMessage({
        text: `거래량 상위 ${data.volumeCount}종목 · 급상승 ${data.gainerCount}종목 동기화 완료`,
        isError: false,
      });
      router.refresh();
    } catch {
      setMessage({ text: "네트워크 오류로 동기화하지 못했어요", isError: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <button
        onClick={sync}
        disabled={pending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--down-soft)",
          color: "var(--down)",
          border: "1px solid var(--down)",
          borderRadius: 8,
          padding: "9px 14px",
          fontWeight: 700,
          fontSize: 13,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "동기화 중…" : "🔄 KRX에서 지금 가져오기"}
      </button>
      {message && (
        <span
          style={{
            fontSize: 12,
            color: message.isError ? "var(--down)" : "var(--dim)",
            whiteSpace: "pre-wrap",
            textAlign: "right",
            maxWidth: 420,
          }}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
