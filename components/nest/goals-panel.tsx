"use client";

// 둥지 리뉴얼 — 목표 관리(GPT 설계 24번: "재방문을 유도하는 핵심 화면").
// 월 투자금 슬라이더를 움직이면 예상 달성일이 그 자리에서 바로 바뀐다 —
// 계산은 lib/finance-goal-math.ts(순수 함수, prisma 없음)를 그대로 씀.
// 현재자산은 목표별로 따로 안 나누고 전체 순자산(netWorth)을 공통으로
// 쓴다 — 목표별 자금 배정까지는 Phase 1 범위 밖이라 일단 이렇게 근사.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { estimateMonthsToGoal, monthsFromTodayLabel } from "@/lib/finance-goal-math";
import { formatWon } from "@/lib/format";

export type GoalRow = {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  monthlyContribution: number;
  expectedReturnPct: number;
};

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
};

const inputStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12.5,
  color: "var(--text)",
  width: "100%",
};

function GoalCard({ goal, netWorth }: { goal: GoalRow; netWorth: number }) {
  const router = useRouter();
  const [contribution, setContribution] = useState(goal.monthlyContribution);
  const [busy, setBusy] = useState(false);

  const progressPct = goal.targetAmount > 0 ? Math.min(100, (netWorth / goal.targetAmount) * 100) : 0;
  const months = estimateMonthsToGoal(netWorth, goal.targetAmount, contribution, goal.expectedReturnPct);
  const label = months === null ? "40년 안엔 어려워요" : months === 0 ? "이미 달성!" : monthsFromTodayLabel(months);

  async function remove() {
    setBusy(true);
    await fetch(`/api/finance/goals/${goal.id}`, { method: "DELETE" });
    router.refresh();
  }

  async function saveContribution() {
    if (contribution === goal.monthlyContribution) return;
    await fetch(`/api/finance/goals/${goal.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyContribution: contribution }),
    });
    router.refresh();
  }

  return (
    <div style={{ background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>🎯 {goal.name}</span>
        <button
          onClick={remove}
          disabled={busy}
          style={{ border: "none", background: "none", color: "var(--faint)", cursor: "pointer", fontSize: 11 }}
        >
          삭제
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--faint)", margin: "4px 0 8px" }}>
        {formatWon(netWorth)} / {formatWon(goal.targetAmount)} · 목표일 {goal.targetDate}
      </div>
      <div style={{ height: 8, background: "var(--panel)", borderRadius: 20, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--accent)", borderRadius: 20 }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>
        <span>월 투자금</span>
        <span style={{ fontWeight: 700, color: "var(--text)", fontFamily: "var(--mono)" }}>{formatWon(contribution)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(goal.monthlyContribution * 3, 3_000_000)}
        step={50_000}
        value={contribution}
        onChange={(e) => setContribution(Number(e.target.value))}
        onMouseUp={saveContribution}
        onTouchEnd={saveContribution}
        style={{ width: "100%" }}
      />

      <div
        style={{
          marginTop: 10,
          fontSize: 12,
          fontWeight: 700,
          textAlign: "center",
          padding: "8px 0",
          borderRadius: 8,
          background: "var(--accent-soft)",
          color: "var(--accent)",
        }}
      >
        예상 달성 → {label}
      </div>
    </div>
  );
}

function AddGoalForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amount = Number(targetAmount);
    const contribution = Number(monthlyContribution);
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0 || !targetDate || !Number.isFinite(contribution)) return;
    setBusy(true);
    await fetch("/api/finance/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), targetAmount: amount, targetDate, monthlyContribution: contribution }),
    }).finally(() => setBusy(false));
    setName("");
    setTargetAmount("");
    setTargetDate("");
    setMonthlyContribution("");
    setOpen(false);
    onAdded();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          border: "1px dashed var(--border2)",
          background: "none",
          color: "var(--faint)",
          cursor: "pointer",
          borderRadius: 10,
          padding: "10px 0",
          fontSize: 12,
        }}
      >
        + 목표 추가
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input placeholder="목표 이름 (예: 첫 1억)" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <input
        placeholder="목표 금액(원)"
        type="number"
        value={targetAmount}
        onChange={(e) => setTargetAmount(e.target.value)}
        style={inputStyle}
      />
      <input placeholder="목표일" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={inputStyle} />
      <input
        placeholder="현재 월 투자금(원)"
        type="number"
        value={monthlyContribution}
        onChange={(e) => setMonthlyContribution(e.target.value)}
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={submit}
          disabled={busy}
          style={{ flex: 1, border: "none", background: "var(--accent)", color: "#0a0d13", fontWeight: 700, borderRadius: 8, padding: "8px 0", cursor: "pointer" }}
        >
          추가
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ border: "1px solid var(--border)", background: "var(--panel2)", color: "var(--dim)", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}
        >
          취소
        </button>
      </div>
    </div>
  );
}

export function GoalsPanel({ goals, netWorth }: { goals: GoalRow[]; netWorth: number }) {
  const router = useRouter();
  return (
    <section style={panelStyle}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>🎯 목표 관리</div>
      {goals.length === 0 && <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>아직 등록한 목표가 없어요.</div>}
      {goals.map((g) => (
        <GoalCard key={g.id} goal={g} netWorth={netWorth} />
      ))}
      <AddGoalForm onAdded={() => router.refresh()} />
    </section>
  );
}
