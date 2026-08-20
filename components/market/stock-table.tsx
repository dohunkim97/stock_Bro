"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AddEntryForm } from "./add-entry-form";
import { chgColorVar, formatChg } from "@/lib/format";
import { SORT_OPTIONS, sortEntries } from "@/lib/sort";
import { STORAGE_CAP } from "@/lib/constants";
import type { DailyEntry } from "@/app/generated/prisma/client";

// 예전엔 위 10개만 보여주고 "더보기"를 눌러야 전체 목록을 모달로 봤는데,
// 지금은 이 칸 안에서 바로 스크롤해서 전체 종목을 다 볼 수 있게 바꿨다 —
// LIST_MAX_HEIGHT는 대략 10줄 높이라 기본적으로 보이는 범위는 그대로다.
const LIST_MAX_HEIGHT = 420;
const MARKETS = ["코스피", "코스닥"] as const;

const COLLAPSED_LABELS = ["#", "종목", "현재가", "등락률", "거래량", "거래대금"];
const COLLAPSED_COLS = "26px 1fr 84px 76px 92px 100px";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  overflow: "hidden",
};

function selectStyle(): React.CSSProperties {
  return {
    background: "var(--panel2)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "4px 8px",
    fontSize: 11,
    fontFamily: "var(--sans)",
    outline: "none",
    cursor: "pointer",
  };
}

function Row({ s, cols, expanded }: { s: DailyEntry; cols: string; expanded: boolean }) {
  const router = useRouter();
  const clickable = !!s.code;

  return (
    <div
      className="hover-row"
      onClick={clickable ? () => router.push(`/stock?code=${s.code}`) : undefined}
      style={{
        borderBottom: "1px solid var(--border)",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: cols,
          gap: 0,
          padding: expanded
            ? s.issue ? "12px 18px 4px" : "12px 18px"
            : s.issue ? "7px 18px 2px" : "7px 18px",
          alignItems: "center",
          fontSize: expanded ? 13.5 : 12.5,
        }}
      >
        <span style={{ fontFamily: "var(--mono)", color: "var(--faint)", fontSize: expanded ? 12 : 11 }}>
          {s.rank}
        </span>
        <span>
          <span style={{ fontWeight: 600 }}>{s.name}</span>{" "}
          <span style={{ fontFamily: "var(--mono)", fontSize: expanded ? 11 : 10, color: "var(--faint)", marginLeft: 5 }}>
            {s.code ?? "-"}
          </span>
        </span>
        <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 500 }}>{s.price}</span>
        <span
          style={{
            textAlign: "right",
            fontFamily: "var(--mono)",
            fontWeight: 600,
            color: chgColorVar(s.changePct),
          }}
        >
          {formatChg(s.changePct)}
        </span>
        <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: expanded ? 12 : 11, color: "var(--dim)" }}>
          {s.volume ?? "-"}
        </span>
        <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: expanded ? 12 : 11, color: "var(--dim)" }}>
          {s.tradingValue ?? "-"}
        </span>
        {expanded && (
          <>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)" }}>
              {s.marketCap ?? "-"}
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{s.per ?? "-"}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{s.pbr ?? "-"}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{s.roe ?? "-"}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{s.debtRatio ?? "-"}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{s.reserveRatio ?? "-"}</span>
          </>
        )}
      </div>
      {s.issue && (
        <div
          style={{
            padding: expanded ? "0 18px 12px" : "0 18px 7px",
            fontSize: expanded ? 12 : 11,
            color: "var(--dim)",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={s.issue}
        >
          📰 {s.issue}
        </div>
      )}
    </div>
  );
}

function MarketSortControls({
  market,
  setMarket,
  marketCounts,
  accentVar,
  sortKey,
  setSortKey,
}: {
  market: (typeof MARKETS)[number];
  setMarket: (m: (typeof MARKETS)[number]) => void;
  marketCounts: Record<string, number>;
  accentVar: string;
  sortKey: string;
  setSortKey: (k: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          display: "flex",
          gap: 2,
          background: "var(--panel2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 2,
        }}
      >
        {MARKETS.map((m) => {
          const active = m === market;
          return (
            <button
              key={m}
              onClick={() => setMarket(m)}
              style={{
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 9px",
                borderRadius: 6,
                background: active ? accentVar : "transparent",
                color: active ? "#0a0d13" : "var(--dim)",
              }}
            >
              {m} {marketCounts[m] ? `(${marketCounts[m]})` : ""}
            </button>
          );
        })}
      </div>
      <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={selectStyle()}>
        {SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export type RankingTab = {
  key: "volume" | "gainer" | "loser";
  label: string;
  badgeText: string;
  badgeColor: string;
  accentVar: string;
  accentSoftVar: string;
  entries: DailyEntry[];
  showVolumeField: boolean;
};

export function StockTable({ date, tabs }: { date: string; tabs: RankingTab[] }) {
  const [activeKey, setActiveKey] = useState(tabs[0].key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const { key: listType, badgeText, badgeColor, accentVar, accentSoftVar, entries, showVolumeField } = active;

  const [market, setMarket] = useState<(typeof MARKETS)[number]>("코스피");
  const [sortKey, setSortKey] = useState("rank");

  const marketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.market ?? ""] = (counts[e.market ?? ""] ?? 0) + 1;
    return counts;
  }, [entries]);

  const filtered = useMemo(() => entries.filter((e) => e.market === market), [entries, market]);
  const sorted = useMemo(() => sortEntries(filtered, sortKey), [filtered, sortKey]);

  const controls = (
    <MarketSortControls
      market={market}
      setMarket={setMarket}
      marketCounts={marketCounts}
      accentVar={accentVar}
      sortKey={sortKey}
      setSortKey={setSortKey}
    />
  );

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          padding: "11px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {tabs.map((t) => {
            const isActive = t.key === activeKey;
            return (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 7,
                  background: isActive ? "var(--panel2)" : "transparent",
                  color: isActive ? "var(--text)" : "var(--faint)",
                }}
              >
                {t.label}
              </button>
            );
          })}
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: badgeColor, marginLeft: 2 }}>
            {badgeText}
          </span>
        </div>

        {sorted.length > 0 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
            전체 {sorted.length}종목 — 스크롤해서 더 보기
          </span>
        )}

        {controls}
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 500 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: COLLAPSED_COLS,
              gap: 0,
              padding: "6px 18px",
              fontSize: 10.5,
              color: "var(--faint)",
              fontFamily: "var(--mono)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {COLLAPSED_LABELS.map((l, i) => (
              <span key={i} style={i >= 2 ? { textAlign: "right" } : undefined}>
                {l}
              </span>
            ))}
          </div>

          {sorted.length === 0 && (
            <div style={{ padding: "22px 18px", textAlign: "center", fontSize: 13, color: "var(--faint)" }}>
              {market}에 입력된 종목이 없어요
            </div>
          )}

          <div style={{ maxHeight: LIST_MAX_HEIGHT, overflowY: "auto" }}>
            {sorted.map((s) => (
              <Row key={s.id} s={s} cols={COLLAPSED_COLS} expanded={false} />
            ))}
          </div>
        </div>
      </div>

      {entries.length < STORAGE_CAP && (
        <AddEntryForm
          date={date}
          listType={listType}
          accentVar={accentVar}
          accentSoftVar={accentSoftVar}
          showVolumeField={showVolumeField}
        />
      )}
    </section>
  );
}
