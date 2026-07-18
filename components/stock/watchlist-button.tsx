"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WatchlistButton({
  code,
  name,
  market,
  sector,
  initialWatched,
}: {
  code: string;
  name: string;
  market: string;
  sector: string;
  initialWatched: boolean;
}) {
  const router = useRouter();
  const [watched, setWatched] = useState(initialWatched);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      if (watched) {
        await fetch(`/api/watchlist/${code}`, { method: "DELETE" });
        setWatched(false);
      } else {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, name, market, sector }),
        });
        setWatched(true);
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={watched}
      title={watched ? "관심종목에서 빼기" : "관심종목에 추가"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: watched ? "var(--accent-soft)" : "var(--panel)",
        color: watched ? "var(--accent)" : "var(--dim)",
        border: `1px solid ${watched ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: "7px 12px",
        fontWeight: 700,
        fontSize: 13,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {watched ? "★ 관심종목" : "☆ 관심종목 추가"}
    </button>
  );
}
