"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
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
                <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                  <span style={{ width: 130, flexShrink: 0, color: "var(--dim)" }}>{f.label}</span>
                  <input
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) || 0 })}
                    inputMode="numeric"
                    style={fieldStyle}
                  />
                  <span style={{ color: "var(--faint)", flexShrink: 0 }}>{f.suffix}</span>
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
