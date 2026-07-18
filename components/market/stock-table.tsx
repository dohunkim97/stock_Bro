"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AddEntryForm } from "./add-entry-form";
import { DeleteEntryButton } from "./delete-entry-button";
import { Modal } from "@/components/ui/modal";
import { chgColorVar, formatChg } from "@/lib/format";
import { SORT_OPTIONS, sortEntries } from "@/lib/sort";
import { STORAGE_CAP } from "@/lib/constants";
import type { DailyEntry } from "@/app/generated/prisma/client";

const HOME_DISPLAY_COUNT = 10;
const MARKETS = ["코스피", "코스닥"] as const;

const COLLAPSED_LABELS = ["#", "종목", "현재가", "등락률", "거래량", "거래대금"];
const EXPANDED_LABELS = [...COLLAPSED_LABELS, "시가총액", "PER", "PBR", "ROE", "부채비율", "유보율"];
const COLLAPSED_COLS = "26px 1fr 84px 76px 92px 100px 18px";
const EXPANDED_COLS = "26px 1fr 84px 76px 92px 100px 84px 60px 60px 64px 76px 84px 18px";

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
    padding: "6px 10px",
    fontSize: 12,
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
        display: "grid",
        gridTemplateColumns: cols,
        gap: 0,
        padding: "12px 18px",
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        fontSize: 13.5,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <span style={{ fontFamily: "var(--mono)", color: "var(--faint)", fontSize: 12 }}>{s.rank}</span>
      <span>
        <span style={{ fontWeight: 600 }}>{s.name}</span>{" "}
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", marginLeft: 5 }}>
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
      <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)" }}>
        {s.volume ?? "-"}
      </span>
      <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)" }}>
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
      <span onClick={(e) => e.stopPropagation()}>
        <DeleteEntryButton id={s.id} />
      </span>
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
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 11px",
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

export function StockTable({
  date,
  listType,
  title,
  badgeText,
  badgeColor,
  accentVar,
  accentSoftVar,
  entries,
  showVolumeField,
}: {
  date: string;
  listType: "volume" | "gainer";
  title: string;
  badgeText: string;
  badgeColor: string;
  accentVar: string;
  accentSoftVar: string;
  entries: DailyEntry[];
  showVolumeField: boolean;
}) {
  const [market, setMarket] = useState<(typeof MARKETS)[number]>("코스피");
  const [sortKey, setSortKey] = useState("rank");
  const [modalOpen, setModalOpen] = useState(false);

  const marketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.market ?? ""] = (counts[e.market ?? ""] ?? 0) + 1;
    return counts;
  }, [entries]);

  const filtered = useMemo(() => entries.filter((e) => e.market === market), [entries, market]);
  const sorted = useMemo(() => sortEntries(filtered, sortKey), [filtered, sortKey]);
  const visible = sorted.slice(0, HOME_DISPLAY_COUNT);

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
          gap: 10,
          padding: "16px 18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: badgeColor }}>{badgeText}</span>
        </div>

        {sorted.length > HOME_DISPLAY_COUNT && (
          <button
            onClick={() => setModalOpen(true)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "7px 12px",
              color: "var(--dim)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            더보기 (전체 {sorted.length}종목)
          </button>
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
              padding: "9px 18px",
              fontSize: 11,
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
            <span />
          </div>

          {visible.length === 0 && (
            <div style={{ padding: "22px 18px", textAlign: "center", fontSize: 13, color: "var(--faint)" }}>
              {market}에 입력된 종목이 없어요
            </div>
          )}

          {visible.map((s) => (
            <Row key={s.id} s={s} cols={COLLAPSED_COLS} expanded={false} />
          ))}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`${title} · 전체 ${sorted.length}종목`}>
        <div style={{ marginBottom: 14, display: "flex", justifyContent: "flex-end" }}>{controls}</div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 920 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: EXPANDED_COLS,
                gap: 0,
                padding: "9px 18px",
                fontSize: 11,
                color: "var(--faint)",
                fontFamily: "var(--mono)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {EXPANDED_LABELS.map((l, i) => (
                <span key={i} style={i >= 2 ? { textAlign: "right" } : undefined}>
                  {l}
                </span>
              ))}
              <span />
            </div>
            {sorted.map((s) => (
              <Row key={s.id} s={s} cols={EXPANDED_COLS} expanded />
            ))}
          </div>
        </div>
      </Modal>
    </section>
  );
}
