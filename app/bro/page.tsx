import { CandidateTracker } from "@/components/bro/candidate-tracker";
import { PredictionReport } from "@/components/bro/prediction-report";
import { ArchiveHub } from "@/components/bro/archive-hub";
import { IntradaySignalPanel } from "@/components/bro/intraday-signal-panel";
import { SplitPane } from "@/components/bro/split-pane";
import { AutoRefresh } from "@/components/market/auto-refresh";

// CandidateTracker does a handful of live KIS quote lookups (one per
// predicted candidate) on every render — cheap individually, but give this
// page the same headroom the stock detail page gets rather than the
// platform's short default. PredictionReport's rare live-fallback path
// (records saved before the `details` column existed — see
// lib/candidate-detail.ts) can also call the DART business-detail fetch
// per candidate, which alone runs ~20s (see lib/dart.ts's
// BUNDLE_BUDGET_MS), so this needs the same headroom as
// app/api/bro/field-detail/route.ts.
export const maxDuration = 60;

// This page has no searchParams/cookies to read, so Next would otherwise
// statically prerender it at build time and freeze CandidateTracker's live
// price data forever — force it to render fresh on every request instead.
export const dynamic = "force-dynamic";

// Header is a fixed 60px, and main's own padding adds 26 (top) + 60
// (bottom) — subtracting all three pins the top board to exactly one
// viewport-height frame, no page scroll for it, so the feed/chat split below
// fills the whole frame and each side scrolls internally on its own.
const HEADER_HEIGHT = 60;
const MAIN_PADDING_TOP = 26;
const MAIN_PADDING_BOTTOM = 60;
const BOARD_HEIGHT = `calc(100vh - ${HEADER_HEIGHT + MAIN_PADDING_TOP + MAIN_PADDING_BOTTOM}px)`;
const SECONDARY_ROW_HEIGHT = 460;

// 골구 = 실시간 AI 트레이딩 워크스페이스가 이 페이지의 중심이다 —
//   위(고정 한 화면): PredictionReport 하나가 좌(60%) 리포트 카드 피드 /
//   우(40%) 골구 대화창을 통째로 그린다(components/bro/golgoo-workspace.tsx).
//   오늘의 공식 추천으로 피드가 시작하고, 대화에서 종목을 물어보면 그
//   위에 카드가 더 쌓인다 — 더는 대화창이 접혔다 펴지는 토글이 아니라
//   항상 떠 있는 고정 사이드바.
//   아래(페이지 스크롤): 예상종목(CandidateTracker) / 기록보관소(ArchiveHub)
//   가로 분할 한 줄, 그 아래 장중 실시간 시그널(IntradaySignalPanel) — 위
//   워크스페이스의 "지금 대화 중심" 리듬과는 성격이 달라 굳이 같은 줄에
//   끼워 넣지 않았다.
export default function BroPage() {
  return (
    <main style={{ maxWidth: 1520, margin: "0 auto", padding: "26px 24px 60px" }}>
      {/* CandidateTracker's % is only as fresh as the last render — without
          this, an open tab sits on whatever price it first loaded with
          until the user manually reloads, which looks exactly like "the
          percentage never changes" even though the underlying live KIS
          quote genuinely is moving. */}
      <AutoRefresh />

      <div style={{ height: BOARD_HEIGHT }}>
        <PredictionReport />
      </div>

      <div style={{ height: SECONDARY_ROW_HEIGHT, marginTop: 20 }}>
        <SplitPane direction="row" start={<CandidateTracker />} end={<ArchiveHub />} defaultEndPct={40} />
      </div>

      <IntradaySignalPanel />
    </main>
  );
}
