"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { NewsList } from "@/components/news-list";
import { chgColorVar, formatChg } from "@/lib/format";
import { formatDateLabel } from "@/lib/dates";
import type { MentionRow } from "@/lib/mention-ranking";
import type { HotSectorResult, SectorBar } from "@/lib/sector-aggregation";
import type { NewsItem } from "@/lib/naver-news";

const DEFAULT_COUNT = 10;
const LIST_TYPE_LABEL: Record<string, string> = { gainer: "급상승", volume: "거래량상위" };

type MentionSortMode = "mention" | "up" | "down";
const MENTION_SORT_OPTIONS: { key: MentionSortMode; label: string }[] = [
  { key: "mention", label: "언급순" },
  { key: "up", label: "상승순" },
  { key: "down", label: "하락순" },
];

function sortMentions(rows: MentionRow[], mode: MentionSortMode): MentionRow[] {
  const sorted = [...rows];
  if (mode === "up") sorted.sort((a, b) => b.avgChangePct - a.avgChangePct);
  else if (mode === "down") sorted.sort((a, b) => a.avgChangePct - b.avgChangePct);
  else sorted.sort((a, b) => b.count - a.count);
  return sorted;
}

const selectStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 7,
  padding: "5px 8px",
  fontSize: 11.5,
  fontFamily: "var(--sans)",
  outline: "none",
  cursor: "pointer",
  flexShrink: 0,
};

const moreButtonStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  borderRadius: 7,
  padding: "5px 9px",
  color: "var(--dim)",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

const ctaButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: 11,
  background: "var(--accent)",
  color: "#0a0d13",
  border: "none",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
  textAlign: "center",
};

function SectorBarItem({ sec, hotSector }: { sec: SectorBar; hotSector: string | null }) {
  const isHot = sec.name === hotSector;
  const color = isHot ? "var(--accent)" : "var(--text)";
  const barColor = isHot ? "var(--accent)" : "var(--dim)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color }}>{sec.name}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)" }}>
          {sec.count}건 · <b style={{ color }}>{sec.pct}%</b>
        </span>
      </div>
      <div style={{ height: 9, background: "var(--bg)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${sec.width}%`, background: barColor, borderRadius: 6 }} />
      </div>
    </div>
  );
}

function MentionRowButton({ r, rank, onSelect }: { r: MentionRow; rank: number; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="hover-accent-border"
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "11px 13px",
        marginBottom: 7,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", width: 16 }}>{rank}</span>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>{r.code ?? "-"}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)" }}>{r.count}회 등장</span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontWeight: 700,
            fontSize: 13,
            width: 60,
            textAlign: "right",
            color: chgColorVar(r.avgChangePct),
          }}
        >
          {formatChg(r.avgChangePct)}
        </span>
      </span>
    </button>
  );
}

function MentionRowLink({ r, rank }: { r: MentionRow; rank: number }) {
  return (
    <Link
      href={r.code ? `/stock?code=${r.code}` : "/stock"}
      className="hover-accent-border"
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "11px 13px",
        marginBottom: 7,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", width: 16 }}>{rank}</span>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>{r.code ?? "-"}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)" }}>{r.count}회 등장</span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontWeight: 700,
            fontSize: 13,
            width: 60,
            textAlign: "right",
            color: chgColorVar(r.avgChangePct),
          }}
        >
          {formatChg(r.avgChangePct)}
        </span>
      </span>
    </Link>
  );
}

// Shown on the left in place of the sector bars once a mentioned stock is
// clicked. The occurrence list (date/list type/rank/등락률) is real data we
// already have; the news list below it is fetched on demand from our own
// /api/news route (which just proxies the 네이버 뉴스 검색 API) — real
// headlines, not an AI-written explanation.
function MentionDetail({ row, onBack }: { row: MentionRow; onBack: () => void }) {
  const [news, setNews] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNews(null);
    fetch(`/api/news?query=${encodeURIComponent(row.name)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setNews(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) setNews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [row.name]);

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "var(--dim)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          marginBottom: 12,
        }}
      >
        ← 섹터 목록으로
      </button>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>{row.name}</h3>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)" }}>{row.code ?? "-"}</span>
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)", marginBottom: 16 }}>
        이번 주 {row.count}회 등장 · 평균 등락률{" "}
        <span style={{ fontWeight: 700, color: chgColorVar(row.avgChangePct) }}>{formatChg(row.avgChangePct)}</span>
      </div>

      <div style={{ fontSize: 12, color: "var(--faint)", fontFamily: "var(--mono)", marginBottom: 8 }}>
        등장 내역
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {row.occurrences.map((o, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "9px 12px",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12.5,
            }}
          >
            <span>{formatDateLabel(o.date)}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)" }}>
              {LIST_TYPE_LABEL[o.listType] ?? o.listType} {o.rank}위
            </span>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: chgColorVar(o.changePct) }}>
              {formatChg(o.changePct)}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "12px 14px",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 12.5 }}>이슈·기사</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
            네이버 뉴스 검색
          </span>
        </div>
        {news === null ? (
          <div style={{ padding: "10px 0", fontSize: 12.5, color: "var(--faint)" }}>불러오는 중…</div>
        ) : (
          <NewsList items={news} emptyLabel={`${row.name} 관련 최근 뉴스가 없어요`} />
        )}
      </div>

      <Link href={row.code ? `/stock?code=${row.code}` : "/stock"} style={ctaButtonStyle}>
        {row.name} 상세 페이지 보기 →
      </Link>
    </div>
  );
}

export function WeeklySectorPanel({ agg, mentions }: { agg: HotSectorResult; mentions: MentionRow[] }) {
  const [selected, setSelected] = useState<MentionRow | null>(null);
  const [sectorModalOpen, setSectorModalOpen] = useState(false);
  const [mentionModalOpen, setMentionModalOpen] = useState(false);
  const [mentionSort, setMentionSort] = useState<MentionSortMode>("mention");

  const visibleSectors = agg.sectors.slice(0, DEFAULT_COUNT);
  const sortedMentions = useMemo(() => sortMentions(mentions, mentionSort), [mentions, mentionSort]);
  const visibleMentions = sortedMentions.slice(0, DEFAULT_COUNT);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28 }}>
        <div>
          {selected ? (
            <MentionDetail row={selected} onBack={() => setSelected(null)} />
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {visibleSectors.map((sec) => (
                  <SectorBarItem key={sec.name} sec={sec} hotSector={agg.hotSector} />
                ))}
              </div>
              {agg.sectors.length > DEFAULT_COUNT && (
                <button
                  onClick={() => setSectorModalOpen(true)}
                  style={{ ...moreButtonStyle, width: "100%", marginTop: 13, padding: 10 }}
                >
                  더보기 (전체 {agg.sectors.length}개 섹터)
                </button>
              )}
            </>
          )}
        </div>

        <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "var(--faint)", fontFamily: "var(--mono)" }}>
              이번 주 가장 많이 언급된 종목
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <select
                value={mentionSort}
                onChange={(e) => setMentionSort(e.target.value as MentionSortMode)}
                style={selectStyle}
              >
                {MENTION_SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              {mentions.length > DEFAULT_COUNT && (
                <button onClick={() => setMentionModalOpen(true)} style={moreButtonStyle}>
                  더보기 (전체 {mentions.length})
                </button>
              )}
            </div>
          </div>

          {visibleMentions.length === 0 ? (
            <div style={{ padding: "12px 0", fontSize: 13, color: "var(--faint)" }}>
              언급된 종목이 없어요
            </div>
          ) : (
            visibleMentions.map((r, i) => (
              <MentionRowButton key={r.name} r={r} rank={i + 1} onSelect={() => setSelected(r)} />
            ))
          )}

          <Link href={visibleMentions[0]?.code ? `/stock?code=${visibleMentions[0].code}` : "/stock"} style={ctaButtonStyle}>
            {visibleMentions[0]?.name ?? "종목"} 상세 분석 보기 →
          </Link>
        </div>
      </div>

      <Modal
        open={sectorModalOpen}
        onClose={() => setSectorModalOpen(false)}
        title={`전체 섹터 · ${agg.sectors.length}개`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {agg.sectors.map((sec) => (
            <SectorBarItem key={sec.name} sec={sec} hotSector={agg.hotSector} />
          ))}
        </div>
      </Modal>

      <Modal
        open={mentionModalOpen}
        onClose={() => setMentionModalOpen(false)}
        title={`이번 주 가장 많이 언급된 종목 · 전체 ${mentions.length}종목`}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <select
            value={mentionSort}
            onChange={(e) => setMentionSort(e.target.value as MentionSortMode)}
            style={selectStyle}
          >
            {MENTION_SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {sortedMentions.map((r, i) => (
          <MentionRowLink key={r.name} r={r} rank={i + 1} />
        ))}
      </Modal>
    </>
  );
}
