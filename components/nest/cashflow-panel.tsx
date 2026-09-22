"use client";

// 둥지 리뉴얼 — 수입/지출/부채 기록(GPT 설계 "📊 소비 분석" 축소판, Phase
// 1 범위). 세 개를 각자 패널로 안 쪼개고 탭 하나로 묶었다 — 항목 자체는
// 아직 단순 CRUD 목록 수준이라(AI 소비 패턴 분석 등은 다음 단계) 화면을
// 늘리기보다 한 곳에 모아두는 쪽을 택함.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatWon } from "@/lib/format";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/finance-constants";

type Row = { id: string; date: string; category: string; amount: number; memo: string | null };
type LiabilityRow = { id: string; name: string; type: string; principal: number; interestRate: number };

const panelStyle: React.CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 };
const inputStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "7px 9px",
  fontSize: 12,
  color: "var(--text)",
};
const tabStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 13px",
  borderRadius: 20,
  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
  background: active ? "var(--accent)" : "transparent",
  color: active ? "#0a0d13" : "var(--dim)",
  cursor: "pointer",
});

function CashFlowList({ rows, endpoint, color }: { rows: Row[]; endpoint: string; color: string }) {
  const router = useRouter();
  const total = rows.reduce((s, r) => s + r.amount, 0);

  async function remove(id: string) {
    await fetch(`${endpoint}/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 8 }}>
        최근 90일 합계 <b style={{ color, fontFamily: "var(--mono)" }}>{formatWon(total)}</b>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
        {rows.length === 0 && <div style={{ fontSize: 11.5, color: "var(--faint)" }}>아직 기록이 없어요.</div>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5 }}>
            <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", width: 78, flexShrink: 0 }}>{r.date}</span>
            <span style={{ flex: 1, color: "var(--text)" }}>{r.category}</span>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color }}>{formatWon(r.amount)}</span>
            <button onClick={() => remove(r.id)} style={{ border: "none", background: "none", color: "var(--faint)", cursor: "pointer", marginLeft: 8 }}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddCashFlowForm({
  endpoint,
  categories,
  onAdded,
}: {
  endpoint: string;
  categories: readonly string[];
  onAdded: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(categories[0]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) return;
    setBusy(true);
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, category, amount: v }),
    }).finally(() => setBusy(false));
    setAmount("");
    onAdded();
  }

  return (
    <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, flex: "1 1 120px" }} />
      <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, flex: "1 1 90px" }}>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        type="number"
        placeholder="금액"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ ...inputStyle, flex: "1 1 90px" }}
      />
      <button
        onClick={submit}
        disabled={busy}
        style={{ border: "none", background: "var(--accent)", color: "#0a0d13", fontWeight: 700, borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}
      >
        추가
      </button>
    </div>
  );
}

function LiabilitiesTab({ rows }: { rows: LiabilityRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const total = rows.reduce((s, r) => s + r.principal, 0);

  async function remove(id: string) {
    await fetch(`/api/finance/liabilities/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function submit() {
    const p = Number(principal);
    const r = Number(rate);
    if (!name.trim() || !Number.isFinite(p) || p <= 0 || !Number.isFinite(r)) return;
    setBusy(true);
    await fetch("/api/finance/liabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type: "기타", principal: p, interestRate: r }),
    }).finally(() => setBusy(false));
    setName("");
    setPrincipal("");
    setRate("");
    router.refresh();
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 8 }}>
        총 부채 <b style={{ color: "var(--down)", fontFamily: "var(--mono)" }}>{formatWon(total)}</b>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {rows.length === 0 && <div style={{ fontSize: 11.5, color: "var(--faint)" }}>등록된 부채가 없어요.</div>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
            <span style={{ color: "var(--text)" }}>
              {r.name} <span style={{ color: "var(--faint)" }}>(금리 {r.interestRate}%)</span>
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--down)" }}>{formatWon(r.principal)}</span>
              <button onClick={() => remove(r.id)} style={{ border: "none", background: "none", color: "var(--faint)", cursor: "pointer" }}>
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input placeholder="부채명" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, flex: "1 1 100px" }} />
        <input
          type="number"
          placeholder="원금"
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 80px" }}
        />
        <input
          type="number"
          placeholder="금리(%)"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 70px" }}
        />
        <button
          onClick={submit}
          disabled={busy}
          style={{ border: "none", background: "var(--accent)", color: "#0a0d13", fontWeight: 700, borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}
        >
          추가
        </button>
      </div>
    </div>
  );
}

export function CashFlowPanel({
  income,
  expense,
  liabilities,
}: {
  income: Row[];
  expense: Row[];
  liabilities: LiabilityRow[];
}) {
  const [tab, setTab] = useState<"income" | "expense" | "debt">("expense");
  const router = useRouter();

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>📊 수입·지출·부채</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setTab("income")} style={tabStyle(tab === "income")}>
            수입
          </button>
          <button onClick={() => setTab("expense")} style={tabStyle(tab === "expense")}>
            지출
          </button>
          <button onClick={() => setTab("debt")} style={tabStyle(tab === "debt")}>
            부채
          </button>
        </div>
      </div>

      {tab === "income" && (
        <>
          <CashFlowList rows={income} endpoint="/api/finance/income" color="var(--up)" />
          <AddCashFlowForm endpoint="/api/finance/income" categories={INCOME_CATEGORIES} onAdded={() => router.refresh()} />
        </>
      )}
      {tab === "expense" && (
        <>
          <CashFlowList rows={expense} endpoint="/api/finance/expense" color="var(--down)" />
          <AddCashFlowForm endpoint="/api/finance/expense" categories={EXPENSE_CATEGORIES} onAdded={() => router.refresh()} />
        </>
      )}
      {tab === "debt" && <LiabilitiesTab rows={liabilities} />}
    </section>
  );
}
