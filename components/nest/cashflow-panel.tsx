"use client";

// 둥지 리뉴얼 — 수입/지출/부채 기록(GPT 설계 "📊 소비 분석" 축소판, Phase
// 1 범위). 세 개를 각자 패널로 안 쪼개고 탭 하나로 묶었다 — 항목 자체는
// 아직 단순 CRUD 목록 수준이라(AI 소비 패턴 분석 등은 다음 단계) 화면을
// 늘리기보다 한 곳에 모아두는 쪽을 택함.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatWon } from "@/lib/format";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/finance-constants";
import { MoneyInput } from "@/components/ui/money-input";
import { calcInstallment, MIN_INSTALLMENT_MONTHS, MAX_INSTALLMENT_MONTHS } from "@/lib/installment";

type Row = {
  id: string;
  date: string;
  category: string;
  amount: number;
  memo: string | null;
  installmentGroupId?: string | null;
  installmentIndex?: number | null;
  installmentMonths?: number | null;
};
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

  async function remove(r: Row) {
    if (r.installmentGroupId && !window.confirm(`할부 전체(${r.installmentMonths}개월)가 함께 삭제돼요. 삭제할까요?`)) return;
    await fetch(`${endpoint}/${r.id}`, { method: "DELETE" });
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
            <span style={{ flex: 1, color: "var(--text)" }}>
              {r.category}
              {r.installmentIndex && r.installmentMonths && (
                <span style={{ marginLeft: 6, fontSize: 10, color: "var(--accent)", background: "var(--accent-soft)", borderRadius: 20, padding: "1px 6px" }}>
                  할부 {r.installmentIndex}/{r.installmentMonths}
                </span>
              )}
            </span>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color }}>{formatWon(r.amount)}</span>
            <button onClick={() => remove(r)} style={{ border: "none", background: "none", color: "var(--faint)", cursor: "pointer", marginLeft: 8 }}>
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
  allowInstallment = false,
}: {
  endpoint: string;
  categories: readonly string[];
  onAdded: () => void;
  allowInstallment?: boolean;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(categories[0]);
  const [amount, setAmount] = useState("");
  const [installment, setInstallment] = useState(false);
  const [months, setMonths] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthsNum = Number(months);
  const plan = installment && amount ? calcInstallment(Number(amount), monthsNum, Number(rate) || 0) : null;

  async function submit() {
    setError(null);
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) return;
    if (installment && !plan) {
      setError(`할부 개월은 ${MIN_INSTALLMENT_MONTHS}~${MAX_INSTALLMENT_MONTHS} 사이로 넣어줘`);
      return;
    }
    setBusy(true);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        installment ? { date, category, amount: v, installmentMonths: monthsNum, annualRatePct: Number(rate) || 0 } : { date, category, amount: v }
      ),
    }).finally(() => setBusy(false));
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "추가하지 못했어요");
      return;
    }
    setAmount("");
    setMonths("");
    setRate("");
    setInstallment(false);
    onAdded();
  }

  const lastPayment = plan ? plan.payments[plan.payments.length - 1] : 0;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, flex: "1 1 120px" }} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, flex: "1 1 90px" }}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <MoneyInput
          value={amount}
          onValueChange={setAmount}
          placeholder={installment ? "총 결제 금액" : "금액"}
          style={inputStyle}
          wrapperStyle={{ flex: "1 1 110px" }}
        />
        <button
          onClick={submit}
          disabled={busy}
          style={{ border: "none", background: "var(--accent)", color: "#0a0d13", fontWeight: 700, borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}
        >
          추가
        </button>
      </div>

      {allowInstallment && (
        <div style={{ marginTop: 8 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--dim)", cursor: "pointer" }}>
            <input type="checkbox" checked={installment} onChange={(e) => setInstallment(e.target.checked)} />
            할부로 결제 (위 날짜가 1회차 결제일, 이후 매월 같은 날)
          </label>
          {installment && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="number"
                  min={MIN_INSTALLMENT_MONTHS}
                  max={MAX_INSTALLMENT_MONTHS}
                  placeholder="개월 수"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  style={{ ...inputStyle, width: 84 }}
                />
                {[3, 6, 10, 12].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMonths(String(m))}
                    style={{
                      border: `1px solid ${monthsNum === m ? "var(--accent)" : "var(--border)"}`,
                      background: monthsNum === m ? "var(--accent-soft)" : "var(--panel2)",
                      color: monthsNum === m ? "var(--accent)" : "var(--dim)",
                      borderRadius: 20,
                      padding: "4px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {m}개월
                  </button>
                ))}
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  placeholder="연 이자율(%) — 무이자면 비움"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  style={{ ...inputStyle, flex: "1 1 170px" }}
                />
              </div>
              {plan && (
                <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 8, lineHeight: 1.6 }}>
                  매달 <b style={{ color: "var(--down)", fontFamily: "var(--mono)" }}>{lastPayment.toLocaleString()}원</b> × {plan.months}개월
                  {plan.payments[0] !== lastPayment && ` (1회차 ${plan.payments[0].toLocaleString()}원)`}
                  {" · "}총 {plan.totalPaid.toLocaleString()}원{plan.interest > 0 && ` (이자 ${plan.interest.toLocaleString()}원 포함)`}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {error && <div style={{ fontSize: 11.5, color: "var(--up)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// 앞으로 낼 할부 — 같은 할부(groupId)의 남은 회차를 한 줄로 묶어 보여준다.
function UpcomingInstallments({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.installmentGroupId ?? r.id;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const monthlyNext = [...groups.values()].reduce((s, g) => s + g[0].amount, 0);
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 8 }}>
        예정된 할부 · 다음 회차 합계 <b style={{ color: "var(--down)", fontFamily: "var(--mono)" }}>{formatWon(monthlyNext)}</b>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[...groups.entries()].map(([key, g]) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, gap: 8 }}>
            <span style={{ color: "var(--text)" }}>
              {g[0].category}
              <span style={{ color: "var(--faint)", marginLeft: 6 }}>
                남은 {g.length}회 · 다음 {g[0].date.slice(5)} ({g[0].installmentIndex}/{g[0].installmentMonths}회차)
              </span>
            </span>
            <span style={{ fontFamily: "var(--mono)", color: "var(--dim)", whiteSpace: "nowrap" }}>
              월 {formatWon(g[0].amount)} · 남은 {formatWon(g.reduce((s, r) => s + r.amount, 0))}
            </span>
          </div>
        ))}
      </div>
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
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
        <input placeholder="부채명" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, flex: "1 1 100px" }} />
        <MoneyInput value={principal} onValueChange={setPrincipal} placeholder="원금" style={inputStyle} wrapperStyle={{ flex: "1 1 110px" }} />
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
  upcoming = [],
  liabilities,
}: {
  income: Row[];
  expense: Row[];
  upcoming?: Row[];
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
          <AddCashFlowForm endpoint="/api/finance/expense" categories={EXPENSE_CATEGORIES} onAdded={() => router.refresh()} allowInstallment />
          <UpcomingInstallments rows={upcoming} />
        </>
      )}
      {tab === "debt" && <LiabilitiesTab rows={liabilities} />}
    </section>
  );
}
