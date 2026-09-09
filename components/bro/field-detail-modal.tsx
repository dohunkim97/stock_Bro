"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { renderBold } from "@/components/ui/rich-text";
import { chgColorVar, formatChg, formatWon } from "@/lib/format";
import { MiniPriceChart } from "./mini-price-chart";
import type { FieldKey, BusinessDetail, MarketDetail, VolumeDetail, ChartDetail, MaterialDetail, SupplyDetail, FinancialDetail } from "@/lib/field-detail";

const FIELD_LABEL: Record<FieldKey, string> = {
  business: "사업 요약",
  market: "시황",
  volume: "거래량",
  chart: "차트 · 매수타이밍",
  material: "재료",
  supply: "수급",
  financial: "재무",
};

type AnyDetail =
  | { field: "business"; data: BusinessDetail }
  | { field: "market"; data: MarketDetail }
  | { field: "volume"; data: VolumeDetail }
  | { field: "chart"; data: ChartDetail }
  | { field: "material"; data: MaterialDetail }
  | { field: "supply"; data: SupplyDetail }
  | { field: "financial"; data: FinancialDetail };

const cardStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 14,
};

function won(n: number): string {
  return n >= 0 ? `+${formatWon(n)}` : `-${formatWon(Math.abs(n))}`;
}

function BusinessView({ data }: { data: BusinessDetail }) {
  return <p style={{ margin: 0, fontSize: 12, lineHeight: 1.8 }}>{renderBold(data.content)}</p>;
}

function MarketView({ data }: { data: MarketDetail }) {
  return <p style={{ margin: 0, fontSize: 12, lineHeight: 1.8 }}>{renderBold(data.content)}</p>;
}

function VolumeView({ data }: { data: VolumeDetail }) {
  const maxVol = Math.max(...data.rows.map((r) => r.volume), 1);
  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--text)" }}>{data.note}</p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140 }}>
        {data.rows.map((r) => (
          <div key={r.date} title={`${r.date}: ${r.volume.toLocaleString()}주`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div style={{ height: `${Math.max(2, (r.volume / maxVol) * 100)}%`, background: "var(--accent)", borderRadius: "2px 2px 0 0" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--faint)", marginTop: 6, fontFamily: "var(--mono)" }}>
        <span>{data.rows[0]?.date}</span>
        <span>{data.rows[data.rows.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function ChartView({ data }: { data: ChartDetail }) {
  const t = data.buyTiming;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <MiniPriceChart candles={data.candles} buyTiming={data.buyTiming} story={data.story} />

      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 11.5, marginBottom: 8 }}>매수타이밍</div>
        <div style={{ fontSize: 11, lineHeight: 1.8, color: "var(--text)" }}>
          <div>현재가: <b style={{ fontFamily: "var(--mono)" }}>{t.currentPrice !== null ? `${Math.round(t.currentPrice).toLocaleString()}원` : "-"}</b></div>
          <div>지지선: <b style={{ fontFamily: "var(--mono)" }}>{t.support !== null ? `${Math.round(t.support).toLocaleString()}원` : "-"}</b></div>
          <div>저항선: <b style={{ fontFamily: "var(--mono)" }}>{t.resistance !== null ? `${Math.round(t.resistance).toLocaleString()}원` : "-"}</b></div>
          <div>목표가: <b style={{ fontFamily: "var(--mono)", color: "var(--up)" }}>{t.targetPrice !== null ? `${Math.round(t.targetPrice).toLocaleString()}원` : "-"}</b></div>
          <div>손절가: <b style={{ fontFamily: "var(--mono)", color: "var(--down)" }}>{t.stopLossPrice !== null ? `${Math.round(t.stopLossPrice).toLocaleString()}원` : "-"}</b></div>
        </div>
      </div>

      {data.signals.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 11.5, marginBottom: 8 }}>오늘의 기술적 시그널</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {data.signals.map((s) => (
              <div key={s.name} style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: s.direction === "bullish" ? "var(--up)" : s.direction === "bearish" ? "var(--down)" : "var(--dim)" }}>
                  {s.name}
                </span>
                {" — "}
                {s.detail}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.story.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 11.5, marginBottom: 8 }}>차트 스토리 (지지/저항 흐름)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.story.map((ev) => (
              <div key={ev.stepNumber} style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                <b style={{ color: ev.direction === "bullish" ? "var(--up)" : ev.direction === "bearish" ? "var(--down)" : "var(--accent)" }}>
                  {["①", "②", "③", "④", "⑤"][ev.stepNumber - 1]} {ev.badgeLabel}
                </b>{" "}
                <span style={{ color: "var(--faint)", fontFamily: "var(--mono)" }}>{ev.date}</span>
                <div style={{ color: "var(--dim)" }}>{ev.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialView({ data }: { data: MaterialDetail }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.8 }}>{renderBold(data.narrative)}</p>
      {data.news.length > 0 && (
        <div>
          <div style={{ fontWeight: 800, fontSize: 11.5, marginBottom: 8 }}>참고 뉴스</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.news.map((n) => (
              <a key={n.link} href={n.link} target="_blank" rel="noopener noreferrer" className="hover-accent-border" style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}>
                <div style={{ fontSize: 11.5, fontWeight: 600 }}>{n.title}</div>
                <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 3 }}>{n.source} · {n.pubDate.slice(0, 10)}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SupplyTable({ title, rows }: { title: string; rows: { label: string; foreign: number; institution: number; individual: number }[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 800, fontSize: 11.5, marginBottom: 8 }}>{title}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["기간", "외국인", "기관", "개인"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "var(--faint)", fontWeight: 600, fontSize: 9.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "5px 8px", fontFamily: "var(--mono)" }}>{r.label}</td>
                <td style={{ padding: "5px 8px", fontFamily: "var(--mono)", color: chgColorVar(r.foreign) }}>{won(r.foreign)}</td>
                <td style={{ padding: "5px 8px", fontFamily: "var(--mono)", color: chgColorVar(r.institution) }}>{won(r.institution)}</td>
                <td style={{ padding: "5px 8px", fontFamily: "var(--mono)", color: chgColorVar(r.individual) }}>{won(r.individual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplyView({ data }: { data: SupplyDetail }) {
  const dailyRows = data.daily.map((r) => ({ label: r.date, foreign: r.foreign, institution: r.institution, individual: r.individual }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SupplyTable title="일간 (최근 15거래일)" rows={dailyRows} />
      <SupplyTable title="주간" rows={data.weekly} />
      <SupplyTable title="월간" rows={data.monthly} />
      {data.daily.length === 0 && <div style={{ fontSize: 11.5, color: "var(--faint)" }}>수급 데이터를 가져오지 못했어요.</div>}
    </div>
  );
}

function FinancialView({ data }: { data: FinancialDetail }) {
  return (
    <div>
      {data.annual.length === 0 ? (
        <div style={{ fontSize: 11.5, color: "var(--faint)" }}>재무 데이터를 가져오지 못했어요.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["연도", "매출액", "영업이익", "순이익", "부채비율"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "7px 10px", color: "var(--faint)", fontWeight: 600, fontSize: 9.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.annual.map((y) => (
                <tr key={y.year} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 10px", fontFamily: "var(--mono)", fontWeight: 700 }}>{y.year}</td>
                  <td style={{ padding: "7px 10px", fontFamily: "var(--mono)" }}>{formatWon(y.revenue)}</td>
                  <td style={{ padding: "7px 10px", fontFamily: "var(--mono)", color: chgColorVar(y.operatingProfit) }}>{won(y.operatingProfit)}</td>
                  <td style={{ padding: "7px 10px", fontFamily: "var(--mono)", color: chgColorVar(y.netIncome) }}>{won(y.netIncome)}</td>
                  <td style={{ padding: "7px 10px", fontFamily: "var(--mono)" }}>{Number.isFinite(y.debtRatio) ? `${y.debtRatio.toFixed(1)}%` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10 }}>
        * 분기별 재무제표는 현재 데이터 소스(data.go.kr)가 제공하지 않아요 — 연간 실적만 제공돼요.
      </div>
    </div>
  );
}

// 골구 종목 근거 7항목 중 하나를 클릭했을 때 여는 심층 분석 모달 — 열릴 때
// /api/bro/field-detail을 그 항목 하나만 지연 호출한다.
export function FieldDetailModal({
  open,
  onClose,
  field,
  code,
  name,
  reasoning,
}: {
  open: boolean;
  onClose: () => void;
  field: FieldKey | null;
  code?: string;
  name: string;
  reasoning: string;
}) {
  const [result, setResult] = useState<AnyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !field) return;
    setResult(null);
    setFailed(false);
    setLoading(true);

    const params = new URLSearchParams({ field, name, reasoning });
    if (code) params.set("code", code);

    fetch(`/api/bro/field-detail?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => setResult({ field, data } as AnyDetail))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [open, field, code, name, reasoning]);

  return (
    <Modal open={open} onClose={onClose} title={field ? `${name} · ${FIELD_LABEL[field]}` : ""}>
      {loading && <div style={{ padding: "30px 0", textAlign: "center", color: "var(--faint)", fontSize: 11.5 }}>불러오는 중...</div>}
      {!loading && failed && <div style={{ fontSize: 11.5, color: "var(--faint)" }}>불러오지 못했어요. 다시 눌러주세요.</div>}
      {!loading && !failed && result?.field === "business" && <BusinessView data={result.data} />}
      {!loading && !failed && result?.field === "market" && <MarketView data={result.data} />}
      {!loading && !failed && result?.field === "volume" && <VolumeView data={result.data} />}
      {!loading && !failed && result?.field === "chart" && <ChartView data={result.data} />}
      {!loading && !failed && result?.field === "material" && <MaterialView data={result.data} />}
      {!loading && !failed && result?.field === "supply" && <SupplyView data={result.data} />}
      {!loading && !failed && result?.field === "financial" && <FinancialView data={result.data} />}
    </Modal>
  );
}
