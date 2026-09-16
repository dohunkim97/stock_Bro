import Link from "next/link";
import { getTodayIntradaySignals } from "@/lib/intraday-signal";
import { chgColorVar, formatChg } from "@/lib/format";

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 18,
  marginTop: 16,
};

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  open: { text: "진행중", color: "var(--accent)" },
  target: { text: "목표수익 도달", color: "var(--up)" },
  ma_break: { text: "5선 이탈 청산", color: "var(--down)" },
  eod: { text: "장마감 청산", color: "var(--dim)" },
};

function checkMark(active: boolean): React.ReactNode {
  return <span style={{ color: active ? "var(--up)" : "var(--faint)" }}>{active ? "✓" : "–"}</span>;
}

// 장중 실시간 초단기 시그널("햄버거 기법" 기반, lib/intraday-signal.ts) —
// 장 시작 직후 몇 분간 자동 포착된 오늘의 거래대금 급증+양봉 시그널과
// 그 이후 추적 결과(목표수익 도달/5선 이탈/장마감 청산)를 보여준다.
// AutoRefresh(app/bro/page.tsx)가 60초마다 페이지를 다시 렌더해서 장중엔
// 자동으로 최신 상태로 갱신된다. 실제 주문은 넣지 않는 기록/리서치용 —
// "그 순간에 매수했다고 가정"하고 추적만 한다.
export async function IntradaySignalPanel() {
  const signals = await getTodayIntradaySignals();

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>⚡ 장중 실시간 시그널</span>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>
          장 시작 직후 거래대금 급증 + 양봉 포착 · 목표수익 +3% 또는 5선 이탈 시 청산
        </span>
      </div>

      {signals.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>
          오늘 포착된 시그널이 아직 없어요 — 장 시작 직후(09:00~09:14) 자동으로 스캔해요.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--faint)", fontSize: 10.5, textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}>종목</th>
                <th style={{ padding: "4px 8px" }}>포착시각</th>
                <th style={{ padding: "4px 8px" }}>포착가</th>
                <th style={{ padding: "4px 8px" }}>거래대금 배율</th>
                <th style={{ padding: "4px 8px", textAlign: "center" }}>양봉</th>
                <th style={{ padding: "4px 8px", textAlign: "center" }}>아래꼬리</th>
                <th style={{ padding: "4px 8px", textAlign: "center" }}>섹터 동반</th>
                <th style={{ padding: "4px 8px" }}>상태</th>
                <th style={{ padding: "4px 8px" }}>수익률</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => {
                const status = STATUS_LABEL[s.status] ?? STATUS_LABEL.open;
                const ratio = s.baselineValue > 0 ? s.triggerValue / s.baselineValue : null;
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                      <Link href={`/stock?code=${s.code}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {s.name}
                      </Link>
                      {s.theme && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--faint)" }}>#{s.theme}</span>}
                    </td>
                    <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{s.detectedAt}</td>
                    <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{Math.round(s.triggerPrice).toLocaleString()}</td>
                    <td style={{ padding: "6px 8px", fontFamily: "var(--mono)" }}>{ratio !== null ? `${ratio.toFixed(1)}배` : "-"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{checkMark(s.isBullish)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{checkMark(s.hasLowerWick)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{checkMark(s.sectorConfirmed)}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 700, color: status.color }}>{status.text}</td>
                    <td style={{ padding: "6px 8px", fontFamily: "var(--mono)", fontWeight: 700, color: s.finalPct !== null ? chgColorVar(s.finalPct) : "var(--faint)" }}>
                      {s.finalPct !== null ? formatChg(s.finalPct) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
