"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { chgColorVar, formatChg } from "@/lib/format";
import { SORT_OPTIONS, sortEntries } from "@/lib/sort";
import type { DailyEntry } from "@/app/generated/prisma/client";
import { BasisLabel } from "./basis-label";

// 예전엔 위 10개만 보여주고 "더보기"를 눌러야 전체 목록을 모달로 봤는데,
// 지금은 이 칸 안에서 바로 스크롤해서 전체 종목을 다 볼 수 있게 바꿨다 —
// 목록 칸은 옆 사이드바(업종상위+테마상위+AI 브리핑) 높이에 맞춰 늘어나고,
// 그 안에서 넘치는 종목은 스크롤된다.
const MARKETS = ["코스피", "코스닥"] as const;

// sortKey undefined ("#") means that column isn't clickable — everything
// else maps straight onto lib/sort.ts's SORT_OPTIONS keys, "name" sorting
// 가나다순(ascending) and every other column sorting highest-first.
const COLLAPSED_COLUMNS: { label: string; sortKey?: string }[] = [
  { label: "#" },
  { label: "종목", sortKey: "name" },
  { label: "현재가", sortKey: "price" },
  { label: "등락률", sortKey: "changePct" },
  { label: "거래량", sortKey: "volume" },
  { label: "거래대금", sortKey: "tradingValue" },
];
const COLLAPSED_COLS = "26px 1fr 84px 76px 92px 100px";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  overflow: "hidden",
};

// CSV 안에서 콤마/따옴표/줄바꿈이 있는 값만 큰따옴표로 감싼다(표준 CSV
// 이스케이프 규칙) — 상승이유(뉴스 제목)엔 콤마가 자주 섞여 있어 이게 없으면
// 엑셀에서 열 밀림이 생긴다.
function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// 화면에 보이는 목록(현재 탭·시장·정렬 그대로) 그대로를 CSV로 내려받는다
// — 별도 라이브러리 없이 Excel이 그대로 열 수 있는 CSV로 충분하고(엑셀
// 자체 포맷 .xlsx는 새 의존성이 필요해서), 맨 앞에 UTF-8 BOM을 붙여야
// 엑셀에서 한글이 깨지지 않는다. 기사링크는 실제 기사 URL이 있으면 그걸,
// 없으면(과거 동기화분 등) 네이버 뉴스 검색 링크로 대신 채운다(Row
// 컴포넌트의 링크 폴백과 동일 규칙).
function exportStocksToCsv(entries: DailyEntry[], filenamePrefix: string): void {
  const headers = ["종목명", "종목코드", "현재가", "등락률(%)", "거래량", "거래대금", "찾은 상승이유", "기사링크"];
  const rows = entries.map((e) => [
    e.name,
    e.code ?? "",
    e.price,
    e.changePct.toFixed(2),
    e.volume ?? "",
    e.tradingValue ?? "",
    e.issue ?? "",
    e.issueUrl || (e.issue ? `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(e.issue)}` : ""),
  ]);
  const csvBody = [headers, ...rows].map((row) => row.map((f) => escapeCsvField(String(f))).join(",")).join("\r\n");
  const blob = new Blob([`﻿${csvBody}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportButtonStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "var(--panel2)",
    border: "1px solid var(--border)",
    color: "var(--dim)",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "var(--sans)",
    cursor: "pointer",
  };
}

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
        // issueUrl은 동기화 시점에 이 헤드라인 텍스트로 네이버 뉴스를
        // 관련도순 검색해서 찾아둔 실제 기사 링크(lib/kis-ranking.ts) —
        // KIS 뉴스 API 자체는 제목만 주고 URL을 안 줘서 역으로 찾아야 한다.
        // "종목명 상승폭 확대"류 정형 자동캡션은 그 검색이 엉뚱한 회사
        // 기사를 잡아올 수 있어 애초에 시도하지 않고 issueUrl을 비워두는데
        // (lib/kis-news.ts의 isInformativeTitle), 그때·과거 동기화분(마이
        // 그레이션 이전이라 issueUrl 자체가 없는 기존 행)엔 검색결과 페이지로
        // 대신 보낸다. stopPropagation 없이는 이 줄을 눌러도 바깥 행의
        // onClick(종목상세 이동)이 같이 걸려버린다(실측 버그).
        <a
          href={
            s.issueUrl ||
            `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(s.issue)}`
          }
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "block",
            padding: expanded ? "0 18px 12px" : "0 18px 7px",
            fontSize: expanded ? 12 : 11,
            color: "var(--dim)",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textDecoration: "none",
            cursor: "pointer",
          }}
          title={s.issueUrl ? s.issue : `관련 기사 검색: ${s.issue}`}
        >
          📰 {s.issue}
        </a>
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
  entries: DailyEntry[];
};

export function StockTable({ tabs, basisLabel }: { tabs: RankingTab[]; basisLabel?: string | null }) {
  const [activeKey, setActiveKey] = useState(tabs[0].key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const { badgeText, badgeColor, accentVar, entries } = active;

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
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <MarketSortControls
        market={market}
        setMarket={setMarket}
        marketCounts={marketCounts}
        accentVar={accentVar}
        sortKey={sortKey}
        setSortKey={setSortKey}
      />
      <button
        onClick={() => exportStocksToCsv(sorted, `TOP종목_${active.label}_${market}`)}
        disabled={sorted.length === 0}
        title="지금 보이는 목록(종목명/등락률/거래량/거래대금/상승이유/기사링크)을 엑셀(CSV)로 내려받기"
        style={{ ...exportButtonStyle(), opacity: sorted.length === 0 ? 0.5 : 1, cursor: sorted.length === 0 ? "default" : "pointer" }}
      >
        📊 엑셀 추출
      </button>
    </div>
  );

  return (
    <section style={{ ...panelStyle, display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          padding: "12px 16px 0",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>TOP종목</span>
        <BasisLabel label={basisLabel ?? null} />
      </div>

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

      <div style={{ overflowX: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ minWidth: 500, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
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
            {COLLAPSED_COLUMNS.map((c, i) => {
              const active = !!c.sortKey && c.sortKey === sortKey;
              const alignRight = i >= 2;
              if (!c.sortKey) {
                return (
                  <span key={i} style={alignRight ? { textAlign: "right" } : undefined}>
                    {c.label}
                  </span>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => setSortKey(active ? "rank" : c.sortKey!)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                    color: active ? "var(--text)" : "inherit",
                    fontWeight: active ? 700 : 400,
                    textAlign: alignRight ? "right" : "left",
                    justifyContent: alignRight ? "flex-end" : "flex-start",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  {c.label}
                  {active && <span style={{ fontSize: 8 }}>{c.sortKey === "name" ? "▲" : "▼"}</span>}
                </button>
              );
            })}
          </div>

          {sorted.length === 0 && (
            <div style={{ padding: "22px 18px", textAlign: "center", fontSize: 13, color: "var(--faint)" }}>
              {market}에 입력된 종목이 없어요
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {sorted.map((s) => (
              <Row key={s.id} s={s} cols={COLLAPSED_COLS} expanded={false} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
