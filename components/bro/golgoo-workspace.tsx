"use client";

import { useState } from "react";
import type { CandidateDetail } from "@/lib/candidate-detail";
import { StockReportCard, type CardPayload } from "./stock-report-card";
import { BroChat, type ChatCardRef, type ChatCardUpdate } from "./bro-chat";

// 골구 실시간 AI 트레이딩 워크스페이스 — 좌측 60%는 대화에서 언급된 종목들의
// 정밀 리포트 카드가 쌓이는 피드(오늘의 공식 추천으로 시작), 우측 40%는
// 항상 떠 있는 골구 대화창. 카드 상태는 여기(클라이언트)가 들고 있다가
// 대화 응답에 새 카드/조정 요청이 오면 그대로 반영한다.
export function GolgooWorkspace({
  initialCards,
  headerTitle,
}: {
  initialCards: CardPayload[];
  headerTitle: string;
}) {
  const [cards, setCards] = useState<CardPayload[]>(initialCards);

  // 새로 언급된 종목은 피드 맨 위로 — 이미 떠 있던 같은 종목 카드는 빼고
  // 새 카드로 교체한다(다시 물어보면 최신 데이터로 갱신되는 느낌을 주기
  // 위해 굳이 기존 위치에 그대로 두지 않는다).
  function addCards(newDetails: CandidateDetail[]) {
    setCards((prev) => {
      const newCodes = new Set(newDetails.map((d) => d.code).filter(Boolean));
      const kept = prev.filter((p) => !p.detail.code || !newCodes.has(p.detail.code));
      const added: CardPayload[] = newDetails.map((d) => ({ detail: d, business: null }));
      return [...added, ...kept];
    });
  }

  function applyCardUpdate(update: ChatCardUpdate) {
    setCards((prev) =>
      prev.map((c) =>
        c.detail.code === update.code
          ? {
              ...c,
              detail: {
                ...c.detail,
                strategy: {
                  ...c.detail.strategy,
                  targetPrice: update.targetPrice,
                  targetPct: update.targetPct,
                  stopLossPrice: update.stopLossPrice,
                },
              },
            }
          : c
      )
    );
  }

  function removeCard(code: string | undefined, name: string) {
    setCards((prev) => prev.filter((c) => (c.detail.code ?? c.detail.name) !== (code ?? name)));
  }

  const cardsForContext: ChatCardRef[] = cards
    .filter((c): c is CardPayload & { detail: CandidateDetail & { code: string } } => !!c.detail.code)
    .map((c) => ({
      code: c.detail.code,
      name: c.detail.name,
      entryPrice: c.detail.strategy.entryPrice,
      targetPrice: c.detail.strategy.targetPrice,
      stopLossPrice: c.detail.strategy.stopLossPrice,
    }));

  return (
    <div style={{ display: "flex", height: "100%", gap: 16 }}>
      <div style={{ flex: "0 0 60%", minWidth: 0, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, flexShrink: 0 }}>{headerTitle}</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 4 }}>
          {cards.length === 0 ? (
            <div
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 30,
                textAlign: "center",
                fontSize: 12.5,
                color: "var(--faint)",
              }}
            >
              오른쪽 대화창에서 종목을 물어보면 여기에 분석 카드가 쌓여요.
            </div>
          ) : (
            cards.map((c) => (
              <StockReportCard key={c.detail.code ?? c.detail.name} payload={c} onRemove={() => removeCard(c.detail.code, c.detail.name)} />
            ))
          )}
        </div>
      </div>

      <div style={{ flex: "0 0 40%", minWidth: 0, height: "100%" }}>
        <BroChat cardsForContext={cardsForContext} onNewCards={addCards} onCardUpdate={applyCardUpdate} />
      </div>
    </div>
  );
}
