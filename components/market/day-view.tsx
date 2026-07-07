import Link from "next/link";
import { AddEntryForm } from "./add-entry-form";
import { DeleteEntryButton } from "./delete-entry-button";
import { chgColorVar, formatChg } from "@/lib/format";
import { aggregateSectors } from "@/lib/sector-aggregation";
import type { DailyEntry } from "@/app/generated/prisma/client";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  overflow: "hidden",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 18px",
  borderBottom: "1px solid var(--border)",
};

function ColHeaders({ labels }: { labels: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "26px 1fr 78px 74px 96px 18px",
        gap: 0,
        padding: "9px 18px",
        fontSize: 11,
        color: "var(--faint)",
        fontFamily: "var(--mono)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {labels.map((l, i) => (
        <span key={i} style={i >= 2 ? { textAlign: "right" } : undefined}>
          {l}
        </span>
      ))}
      <span />
    </div>
  );
}

export function DayView({
  date,
  volumeEntries,
  gainerEntries,
}: {
  date: string;
  volumeEntries: DailyEntry[];
  gainerEntries: DailyEntry[];
}) {
  const combined = [...volumeEntries, ...gainerEntries].map((e) => ({
    name: e.name,
    code: e.code,
    sector: e.sector,
    changePct: e.changePct,
  }));
  const agg = aggregateSectors(combined);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 20,
        alignItems: "start",
      }}
    >
      {/* 거래량 상위 입력 */}
      <section style={panelStyle}>
        <div style={headerRowStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>거래량 상위</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)" }}>
              TOP 5
            </span>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
            오늘 입력 · {volumeEntries.length}종목
          </span>
        </div>
        <ColHeaders labels={["#", "종목", "현재가", "등락률", "거래량"]} />
        {volumeEntries.map((s) => (
          <div
            key={s.id}
            className="hover-row"
            style={{
              display: "grid",
              gridTemplateColumns: "26px 1fr 78px 74px 96px 18px",
              gap: 0,
              padding: "12px 18px",
              alignItems: "center",
              borderBottom: "1px solid var(--border)",
              fontSize: 13.5,
            }}
          >
            <span style={{ fontFamily: "var(--mono)", color: "var(--faint)", fontSize: 12 }}>
              {s.rank}
            </span>
            <span>
              <span style={{ fontWeight: 600 }}>{s.name}</span>{" "}
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", marginLeft: 5 }}>
                {s.code ?? "-"}
              </span>
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 500 }}>
              {s.price}
            </span>
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
            <DeleteEntryButton id={s.id} />
          </div>
        ))}
        {volumeEntries.length < 5 && (
          <AddEntryForm date={date} listType="volume" accentVar="var(--accent)" accentSoftVar="var(--accent-soft)" showVolumeField />
        )}
      </section>

      {/* 급상승 입력 */}
      <section style={panelStyle}>
        <div style={headerRowStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>급상승 종목</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--up)" }}>▲ TOP 5</span>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>등락률순</span>
        </div>
        <ColHeaders labels={["#", "종목", "현재가", "등락률", "섹터"]} />
        {gainerEntries.map((s) => (
          <div
            key={s.id}
            className="hover-row"
            style={{
              display: "grid",
              gridTemplateColumns: "26px 1fr 78px 74px 96px 18px",
              gap: 0,
              padding: "12px 18px",
              alignItems: "center",
              borderBottom: "1px solid var(--border)",
              fontSize: 13.5,
            }}
          >
            <span style={{ fontFamily: "var(--mono)", color: "var(--faint)", fontSize: 12 }}>
              {s.rank}
            </span>
            <span>
              <span style={{ fontWeight: 600 }}>{s.name}</span>{" "}
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", marginLeft: 5 }}>
                {s.code ?? "-"}
              </span>
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 500 }}>
              {s.price}
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700, color: "var(--up)" }}>
              {formatChg(s.changePct)}
            </span>
            <span style={{ textAlign: "right", fontSize: 11.5, color: "var(--dim)" }}>{s.sector}</span>
            <DeleteEntryButton id={s.id} />
          </div>
        ))}
        {gainerEntries.length < 5 && (
          <AddEntryForm date={date} listType="gainer" accentVar="var(--up)" accentSoftVar="var(--up-soft)" showVolumeField={false} />
        )}
      </section>

      {/* 주목 섹터 결과 */}
      <section
        style={{
          gridColumn: "1 / -1",
          background: "linear-gradient(180deg, var(--panel2), var(--panel))",
          border: "1px solid var(--border2)",
          borderRadius: 16,
          padding: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -20,
            width: 220,
            height: 220,
            background: "radial-gradient(circle, var(--accent-soft), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        {!agg.hasData ? (
          <div style={{ padding: "12px 0", color: "var(--dim)", fontSize: 14 }}>
            아직 오늘 입력된 종목이 없어요. 위 표에 거래량 상위·급상승 종목을 입력하면 오늘의
            주목 섹터가 여기 나타나요.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 4 }}>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--accent)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                ▲ Today&apos;s Hot Sector
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}>
                오늘 시장이 주목한 섹터는 <span style={{ color: "var(--accent)" }}>{agg.hotSector}</span>
              </h2>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--dim)" }}>
                입력 {agg.totalCount}종목 중{" "}
                <b style={{ color: "var(--text)" }}>{agg.hotSectorCount}종목</b> 포함
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {agg.sectors.map((sec) => {
                  const isHot = sec.name === agg.hotSector;
                  const color = isHot ? "var(--accent)" : "var(--text)";
                  const barColor = isHot ? "var(--accent)" : "var(--dim)";
                  return (
                    <div key={sec.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color }}>{sec.name}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)" }}>
                          {sec.count}종목 · <b style={{ color }}>{sec.pct}%</b>
                        </span>
                      </div>
                      <div style={{ height: 9, background: "var(--bg)", borderRadius: 6, overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${sec.width}%`,
                            background: barColor,
                            borderRadius: 6,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 24 }}>
                <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 12, fontFamily: "var(--mono)" }}>
                  {agg.hotSector} 섹터 기여 종목
                </div>
                {agg.contributors.map((s) => (
                  <Link
                    key={s.name}
                    href={s.code ? `/stock?code=${s.code}` : "/stock"}
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
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
                        {s.code ?? "-"}
                      </span>
                    </span>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, color: chgColorVar(s.changePct) }}>
                      {formatChg(s.changePct)}
                    </span>
                  </Link>
                ))}
                <Link
                  href={agg.contributors[0]?.code ? `/stock?code=${agg.contributors[0].code}` : "/stock"}
                  style={{
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
                  }}
                >
                  {agg.contributors[0]?.name ?? agg.hotSector} 상세 분석 보기 →
                </Link>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
