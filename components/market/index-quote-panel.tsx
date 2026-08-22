"use client";

import { useEffect, useState } from "react";
import { chgColorVar, chgArrow, formatChg } from "@/lib/format";
import type { IndexQuote } from "@/lib/kis-index-quote";

const POLL_MS = 15_000;

function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        padding: "1px 5px",
        borderRadius: 4,
        fontFamily: "var(--mono)",
        background: live ? "var(--up-soft)" : "var(--panel2)",
        color: live ? "var(--up)" : "var(--faint)",
        border: live ? "none" : "1px solid var(--border)",
      }}
      title={live ? "장중 — 실시간 반영" : "장 마감 — 마지막 체결가"}
    >
      {live ? "On" : "Off"}
    </span>
  );
}

// 업종상위/테마상위 옆 세 번째 작은 칸 — 코스피/코스닥/코스피200 (국내),
// 코스피200 야간선물 (CME 연계), 나스닥/다우산업/홍콩H지수 (해외). 서버가
// 처음 렌더링한 값으로 바로 보여주고, 그 뒤로는 /api/market-indices를
// 15초마다 직접 폴링해서 페이지 전체 새로고침(AutoRefresh, 60초) 없이도
// 이 칸만 더 자주 갱신되게 한다. 장이 닫힌 지수는 그 순간의 On/Off로
// 곧바로 알 수 있게 배지를 같이 보여준다(휴장일은 반영 안 됨 — 요일·시간
// 기준 판정이라, 마지막 체결가 자체는 항상 맞지만 배지가 실제 개장 여부와
// 어긋날 수 있는 유일한 경우).
export function IndexQuotePanel({ initialQuotes }: { initialQuotes: IndexQuote[] }) {
  const [quotes, setQuotes] = useState(initialQuotes);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/market-indices");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.quotes)) setQuotes(data.quotes);
      } catch {
        // best-effort — keep showing the last good values on a failed poll
      }
    };
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <section
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>주요 지수</div>

      {quotes.length === 0 ? (
        <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "4px 0" }}>지수 데이터를 아직 가져오지 못했어요.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {quotes.map((q) => (
            <div key={q.name} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, color: "var(--dim)", whiteSpace: "nowrap" }}>{q.name}</span>
                <LiveBadge live={q.live} />
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: "var(--mono)" }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{q.price.toLocaleString()}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: chgColorVar(q.changePct), whiteSpace: "nowrap" }}>
                  {chgArrow(q.changePct)} {formatChg(q.changePct)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
