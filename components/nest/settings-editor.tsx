"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import type { PortfolioSettingsData } from "@/lib/portfolio";

const fieldStyle: React.CSSProperties = {
  height: 36,
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "0 10px",
  fontFamily: "var(--mono)",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

const FIELDS: { key: keyof PortfolioSettingsData; label: string; suffix: string }[] = [
  { key: "totalSeed", label: "총 시드", suffix: "원" },
  { key: "cashAmount", label: "보유현금", suffix: "원" },
  { key: "bondAmount", label: "채권 및 안전자산", suffix: "원" },
  { key: "altAssetAmount", label: "대체자산(금/코인)", suffix: "원" },
];

const TARGET_FIELDS: { key: keyof PortfolioSettingsData; label: string }[] = [
  { key: "targetStockPct", label: "목표 주식 비중" },
  { key: "targetBondPct", label: "목표 채권 비중" },
  { key: "targetAltPct", label: "목표 대체자산 비중" },
  { key: "targetCashPct", label: "목표 현금 비중" },
];

// 둥지 능동적 알림(lib/portfolio-alerts.ts)을 받을 텔레그램 chat id 연결 —
// 발견 방법은 app/api/telegram/webhook/route.ts: 봇한테 아무 메시지나 보내면
// 답장으로 자기 chat id를 알려준다. 포트폴리오 설정(PortfolioSettings)과는
// 다른 테이블(User.telegramChatId)이라 저장 버튼도 따로 둔다 — 하나가
// 실패해도 다른 하나는 그대로 저장되게.
function TelegramAlertSection() {
  const [chatId, setChatId] = useState("");
  const [linked, setLinked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/account/telegram")
      .then((r) => r.json())
      .then((d) => {
        setLinked(d?.telegramChatId ?? null);
        setChatId(d?.telegramChatId ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "저장하지 못했어요");
        return;
      }
      setLinked(data.telegramChatId);
      setSaved(true);
    } catch {
      setError("저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 8, fontWeight: 700 }}>🔔 텔레그램 알림</div>
      <div style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.6, marginBottom: 8 }}>
        보유 종목 판정이 나빠지면 골구가 먼저 메시지를 보내요. 받으려면 텔레그램에서 봇에게 아무 메시지나 보내봐 —
        chat id를 답장으로 알려줘요. 그 번호를 아래에 넣고 저장하면 돼요.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder={loading ? "불러오는 중..." : "chat id (숫자)"}
          disabled={loading}
          style={{ ...fieldStyle, flex: 1 }}
        />
        <button
          onClick={save}
          disabled={busy || loading}
          style={{
            border: "1px solid var(--border)",
            background: "var(--panel2)",
            color: "var(--dim)",
            borderRadius: 8,
            padding: "0 14px",
            fontSize: 12.5,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "저장 중..." : "저장"}
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: "var(--up)", marginTop: 6 }}>{error}</div>}
      {saved && !error && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 6 }}>저장했어요.</div>}
      {!loading && (
        <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 6 }}>
          {linked ? `연결됨 (${linked})` : "아직 연결 안 됨 — 비워두면 알림 없이 그대로예요"}
        </div>
      )}
    </div>
  );
}

// 상단 요약 바/도넛 차트가 쓰는 값(총 시드·현금·채권·대체자산·목표 비중)을
// 편집하는 모달. 이 값들은 실시간 시세가 없는 항목(채권/대체자산/현금)이라
// 보유 종목 테이블처럼 종목 단위로 관리하지 않고 여기서 총액을 직접 입력받는다.
export function SettingsEditor({ settings }: { settings: PortfolioSettingsData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PortfolioSettingsData>(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError("저장하지 못했어요");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  const targetSum = TARGET_FIELDS.reduce((sum, f) => sum + (Number(form[f.key]) || 0), 0);

  return (
    <>
      <button
        onClick={() => {
          setForm(settings);
          setOpen(true);
        }}
        style={{
          border: "1px solid var(--border)",
          background: "var(--panel)",
          color: "var(--dim)",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 11.5,
          cursor: "pointer",
          marginLeft: "auto",
        }}
      >
        ⚙ 설정
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="둥지 설정">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 320 }}>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 8, fontWeight: 700 }}>자산 총액</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {FIELDS.map((f) => (
                <label key={f.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12.5 }}>
                  <span style={{ width: 130, flexShrink: 0, color: "var(--dim)", lineHeight: "36px" }}>{f.label}</span>
                  <MoneyInput
                    value={form[f.key] ? String(form[f.key]) : ""}
                    onValueChange={(d) => setForm({ ...form, [f.key]: Number(d) || 0 })}
                    style={fieldStyle}
                    wrapperStyle={{ flex: 1 }}
                  />
                  <span style={{ color: "var(--faint)", flexShrink: 0, lineHeight: "36px" }}>{f.suffix}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 8, fontWeight: 700 }}>
              목표 비중 (합계 {targetSum}%{targetSum !== 100 ? " — 100%를 권장해요" : ""})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TARGET_FIELDS.map((f) => (
                <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                  <span style={{ width: 130, flexShrink: 0, color: "var(--dim)" }}>{f.label}</span>
                  <input
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) || 0 })}
                    inputMode="numeric"
                    style={fieldStyle}
                  />
                  <span style={{ color: "var(--faint)", flexShrink: 0 }}>%</span>
                </label>
              ))}
            </div>
          </div>

          <TelegramAlertSection />

          {error && <div style={{ fontSize: 11.5, color: "var(--up)" }}>{error}</div>}

          <button
            onClick={save}
            disabled={busy}
            style={{
              height: 38,
              borderRadius: 9,
              border: "none",
              background: "var(--accent)",
              color: "#0a0d13",
              fontWeight: 700,
              fontSize: 13,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "저장 중..." : "저장"}
          </button>
        </div>
      </Modal>
    </>
  );
}
