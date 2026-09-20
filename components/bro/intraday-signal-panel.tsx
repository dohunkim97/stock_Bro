import Link from "next/link";
import { getTodayIntradaySignals, getRecentIntradaySignals, type IntradaySignalRow } from "@/lib/intraday-signal";
import { formatDateLabel } from "@/lib/dates";
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

// 지난 기록에서는 이미 다 지난 날인데도 "open"(진행중)으로 남아있는 행이
// 나올 수 있다 — 크론이 하루 중간에 잠깐 끊겼던 날처럼, 그날 장마감
// 강제청산(closeOutIntradaySignals) 호출 자체가 한 번도 안 돈 경우. 그런
// 행은 "청산 기록 없음"으로 표시해 마치 지금도 진행 중인 것처럼 보이는
// 착시를 막는다 — 오늘 날짜 한정으로만 진짜 "진행중"이 뜻이 통한다.
function statusFor(s: IntradaySignalRow, isToday: boolean): { text: string; color: string } {
  if (s.status === "open" && !isToday) return { text: "청산 기록 없음", color: "var(--faint)" };
  return STATUS_LABEL[s.status] ?? STATUS_LABEL.open;
}

function checkMark(active: boolean): React.ReactNode {
  return <span style={{ color: active ? "var(--up)" : "var(--faint)" }}>{active ? "✓" : "–"}</span>;
}

function SignalTable({ signals, isToday }: { signals: IntradaySignalRow[]; isToday: boolean }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "var(--faint)", fontSize: 10.5, textAlign: "left" }}>
            <th style={{ padding: "4px 8px" }}>종목</th>
            <th style={{ padding: "4px 8px" }}>매수시기</th>
            <th style={{ padding: "4px 8px" }}>매수가</th>
            <th style={{ padding: "4px 8px" }}>거래대금 배율</th>
            <th style={{ padding: "4px 8px", textAlign: "center" }}>양봉</th>
            <th style={{ padding: "4px 8px", textAlign: "center" }}>아래꼬리</th>
            <th style={{ padding: "4px 8px", textAlign: "center" }}>섹터 동반</th>
            <th style={{ padding: "4px 8px" }}>상태</th>
            <th style={{ padding: "4px 8px" }}>매수 이후 수익률</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => {
            const status = statusFor(s, isToday);
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
                <td
                  style={{
                    padding: "6px 8px",
                    fontFamily: "var(--mono)",
                    fontWeight: 700,
                    color: s.finalPct !== null ? chgColorVar(s.finalPct) : "var(--faint)",
                  }}
                >
                  {s.finalPct !== null ? formatChg(s.finalPct) : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const RECENT_DAYS = 10;

// 장중 실시간 초단기 시그널("햄버거 기법" 기반, lib/intraday-signal.ts) —
// 장 시작 직후 자동 포착된 오늘의 거래대금 급증+양봉 시그널과 그 이후
// 추적 결과(목표수익 도달/5선 이탈/장마감 청산)를 보여준다. AutoRefresh
// (app/bro/page.tsx)가 60초마다 페이지를 다시 렌더해서 장중엔 자동으로
// 최신 상태로 갱신된다. 실제 주문은 넣지 않는 기록/리서치용 — "그 순간에
// 매수했다고 가정"하고 추적만 한다.
//
// 아래 "지난 기록"은 사용자 요청("일하느라 장중에 못 보고 지나갈 수
// 있으니 기록을 남겨줘")으로 추가 — 오늘 이전 최근 며칠치를 날짜별로
// 묶어서 매수시기/매수가/이후 수익률을 그대로 다시 확인할 수 있게 한다.
// 참고: 2026-09-16 밤~2026-09-21 사이엔 이 기능을 돌리던 크론이(배포를
// 막던 별개 사고 때문에) 통째로 꺼져 있었어서 그 기간엔 기록이 없다 —
// 아래 표는 크론이 복구된 이후부터 새로 쌓인다.
export async function IntradaySignalPanel() {
  const [todaySignals, recentDays] = await Promise.all([getTodayIntradaySignals(), getRecentIntradaySignals(RECENT_DAYS)]);

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>⚡ 장중 실시간 시그널</span>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>
          장 시작 직후 거래대금 급증 + 양봉 포착 · 목표수익 +3% 또는 5선 이탈 시 청산
        </span>
      </div>

      {todaySignals.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>
          오늘 포착된 시그널이 아직 없어요 — 장 시작 직후(09:00~10:00) 자동으로 스캔해요.
        </div>
      ) : (
        <SignalTable signals={todaySignals} isToday />
      )}

      {recentDays.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border2)" }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10, color: "var(--faint)" }}>
            📋 지난 기록 (최근 {recentDays.length}일)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {recentDays.map((day) => (
              <div key={day.date}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 6, fontFamily: "var(--mono)" }}>
                  {formatDateLabel(day.date)}
                </div>
                <SignalTable signals={day.signals} isToday={false} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
