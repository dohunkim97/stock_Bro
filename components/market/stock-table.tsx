"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
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

// 종목 목록 한 판을 시트 하나 분량의 2차원 배열(헤더+행)로 바꾼다 —
// 기사링크는 실제 기사 URL이 있으면 그걸, 없으면(과거 동기화분 등) 네이버
// 뉴스 검색 링크로 대신 채운다(Row 컴포넌트의 링크 폴백과 동일 규칙).
function buildSheetRows(entries: DailyEntry[]): (string | number)[][] {
  const headers = ["종목명", "종목코드", "현재가", "등락률(%)", "거래량", "거래대금", "찾은 상승이유", "기사링크"];
  const rows = entries.map((e) => [
    e.name,
    e.code ?? "",
    e.price,
    Number(e.changePct.toFixed(2)),
    e.volume ?? "",
    e.tradingValue ?? "",
    e.issue ?? "",
    e.issueUrl || (e.issue ? `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(e.issue)}` : ""),
  ]);
  return [headers, ...rows];
}

// 엑셀 시트 이름은 31자 제한 + : \ / ? * [ ] 를 못 써서, 탭 라벨의 공백만
// 지운 이름으로 만든다(예: "급상승 종목" → "급상승종목").
function sanitizeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, "").replace(/\s+/g, "").slice(0, 31) || "Sheet";
}

// 선택된 (탭 × 시장) 조합마다 워크시트 하나씩 넣은 통합 엑셀 파일 하나를
// 내려받는다 — 같은 탭·시장 조합이 겹치면 시트 이름도 겹치므로 뒤에 숫자를
// 붙여 유일하게 만든다.
function downloadWorkbook(sheets: { name: string; entries: DailyEntry[] }[]): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  for (const sheet of sheets) {
    let name = sanitizeSheetName(sheet.name);
    let suffix = 2;
    while (usedNames.has(name)) {
      const base = sanitizeSheetName(sheet.name).slice(0, 28);
      name = `${base}_${suffix++}`;
    }
    usedNames.add(name);
    const ws = XLSX.utils.aoa_to_sheet(buildSheetRows(sheet.entries));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(wb, `TOP종목_추출_${today}.xlsx`);
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

function checkboxRowStyle(): React.CSSProperties {
  return { display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text)", cursor: "pointer", padding: "3px 0" };
}

// TOP종목 엑셀 추출 팝오버 — 버튼을 누르면 즉시 다운로드하는 대신, 시장
// (코스피/코스닥) × 탭(급상승/급락/거래량상위)을 체크박스로 골라 하나의
// 엑셀 파일 안에 시트별로 나눠 담아 내려받는다. 열렸을 때는 지금 보고
// 있던 탭·시장 하나만 기본으로 체크돼 있다(사용자 요청).
function ExportPopover({
  tabs,
  market,
  onClose,
  onDownload,
}: {
  tabs: RankingTab[];
  market: (typeof MARKETS)[number];
  onClose: () => void;
  onDownload: (selectedTabKeys: Set<string>, selectedMarkets: Set<string>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedTabKeys, setSelectedTabKeys] = useState<Set<string>>(new Set([tabs[0]?.key].filter(Boolean) as string[]));
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(new Set([market]));

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  const allSelected = selectedTabKeys.size === tabs.length && selectedMarkets.size === MARKETS.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedTabKeys(new Set());
      setSelectedMarkets(new Set());
    } else {
      setSelectedTabKeys(new Set(tabs.map((t) => t.key)));
      setSelectedMarkets(new Set(MARKETS));
    }
  }

  function toggleMarket(m: string) {
    setSelectedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function toggleTab(key: string) {
    setSelectedTabKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const canDownload = selectedTabKeys.size > 0 && selectedMarkets.size > 0;

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        zIndex: 20,
        width: 220,
        background: "var(--panel)",
        border: "1px solid var(--border2)",
        borderRadius: 12,
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        padding: 14,
      }}
    >
      <label style={{ ...checkboxRowStyle(), fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 6 }}>
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        전체 선택 / 전체 해제
      </label>

      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)", margin: "6px 0 2px" }}>시장</div>
      {MARKETS.map((m) => (
        <label key={m} style={checkboxRowStyle()}>
          <input type="checkbox" checked={selectedMarkets.has(m)} onChange={() => toggleMarket(m)} />
          {m}
        </label>
      ))}

      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)", margin: "8px 0 2px" }}>카테고리</div>
      {tabs.map((t) => (
        <label key={t.key} style={checkboxRowStyle()}>
          <input type="checkbox" checked={selectedTabKeys.has(t.key)} onChange={() => toggleTab(t.key)} />
          {t.label}
        </label>
      ))}

      {!canDownload && (
        <div style={{ fontSize: 10.5, color: "var(--down)", marginTop: 8 }}>다운로드할 항목을 최소 1개 이상 선택해 주세요</div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          onClick={() => canDownload && onDownload(selectedTabKeys, selectedMarkets)}
          disabled={!canDownload}
          style={{
            flex: 1,
            fontSize: 11.5,
            fontWeight: 700,
            padding: "7px 0",
            borderRadius: 8,
            border: "none",
            background: canDownload ? "var(--accent)" : "var(--panel2)",
            color: canDownload ? "#0a0d13" : "var(--faint)",
            cursor: canDownload ? "pointer" : "default",
          }}
        >
          선택한 항목 다운로드
        </button>
        <button
          onClick={onClose}
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            padding: "7px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--panel2)",
            color: "var(--dim)",
            cursor: "pointer",
          }}
        >
          취소
        </button>
      </div>
    </div>
  );
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
  const [exportOpen, setExportOpen] = useState(false);

  const marketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.market ?? ""] = (counts[e.market ?? ""] ?? 0) + 1;
    return counts;
  }, [entries]);

  const filtered = useMemo(() => entries.filter((e) => e.market === market), [entries, market]);
  const sorted = useMemo(() => sortEntries(filtered, sortKey), [filtered, sortKey]);

  const controls = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
      <MarketSortControls
        market={market}
        setMarket={setMarket}
        marketCounts={marketCounts}
        accentVar={accentVar}
        sortKey={sortKey}
        setSortKey={setSortKey}
      />
      <button
        // key로 팝오버를 매번 새로 마운트해서, 열 때마다 "지금 보고 있는
        // 탭·시장"으로 기본 체크 상태가 다시 초기화되게 한다(사용자 요청).
        onClick={() => setExportOpen((v) => !v)}
        title="시장·카테고리를 선택해서 엑셀(xlsx)로 내려받기"
        style={exportButtonStyle()}
      >
        📊 엑셀 추출
      </button>
      {exportOpen && (
        <ExportPopover
          key={`${activeKey}-${market}`}
          tabs={tabs}
          market={market}
          onClose={() => setExportOpen(false)}
          onDownload={(selectedTabKeys, selectedMarkets) => {
            const sheets = tabs
              .filter((t) => selectedTabKeys.has(t.key))
              .flatMap((t) =>
                [...selectedMarkets].map((m) => ({
                  name: `${m}_${t.label}`,
                  entries: sortEntries(t.entries.filter((e) => e.market === m), "rank"),
                }))
              );
            downloadWorkbook(sheets);
            setExportOpen(false);
          }}
        />
      )}
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
