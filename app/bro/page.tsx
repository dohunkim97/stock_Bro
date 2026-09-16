import { BroChat } from "@/components/bro/bro-chat";
import { CandidateTracker } from "@/components/bro/candidate-tracker";
import { PredictionReport } from "@/components/bro/prediction-report";
import { ArchiveHub } from "@/components/bro/archive-hub";
import { IntradaySignalPanel } from "@/components/bro/intraday-signal-panel";
import { SplitPane } from "@/components/bro/split-pane";
import { ReportChatPanel } from "@/components/bro/report-chat-panel";
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
// (bottom) — subtracting all three pins the whole board to exactly one
// viewport-height frame (① from the original sketch), no page scroll, so
// every pane below fills its slot instead of leaving dead space and each
// pane scrolls internally on its own.
const HEADER_HEIGHT = 60;
const MAIN_PADDING_TOP = 26;
const MAIN_PADDING_BOTTOM = 60;
const BOARD_HEIGHT = `calc(100vh - ${HEADER_HEIGHT + MAIN_PADDING_TOP + MAIN_PADDING_BOTTOM}px)`;

// Layout: a fixed 70:30 left:right column split (not draggable — only what's
// inside each column is) —
//   left:  예상리포트(PredictionReport), full width by default — a "💬 대화"
//          toggle floats over its top-right corner and slides 대화창(BroChat)
//          open alongside it when pressed (see ReportChatPanel)
//   right: 예상종목(CandidateTracker) / 기록보관소(ArchiveHub), 6:4 default —
//          drag the horizontal bar to resize height
// PredictionReport is this week's write-up behind CandidateTracker's picks
// (섹터/종목 예상 근거); ArchiveHub is a 3-tab archive (예상리포트/일간리포트/
// 대화기록) under CandidateTracker.
export default function BroPage() {
  return (
    <main style={{ maxWidth: 1220, margin: "0 auto", padding: "26px 24px 60px" }}>
      {/* CandidateTracker's % is only as fresh as the last render — without
          this, an open tab sits on whatever price it first loaded with
          until the user manually reloads, which looks exactly like "the
          percentage never changes" even though the underlying live KIS
          quote genuinely is moving. */}
      <AutoRefresh />
      <div style={{ display: "flex", alignItems: "stretch", height: BOARD_HEIGHT }}>
        <div style={{ flex: "0 0 70%", minWidth: 0, paddingRight: 12 }}>
          <ReportChatPanel report={<PredictionReport />} chat={<BroChat />} />
        </div>

        <div style={{ flex: "0 0 30%", minWidth: 0, paddingLeft: 12 }}>
          <SplitPane
            direction="column"
            start={<CandidateTracker />}
            end={<ArchiveHub />}
            defaultEndPct={40}
          />
        </div>
      </div>

      {/* 고정 한 화면(BOARD_HEIGHT) 보드 아래 별도 섹션 — 이 판만 페이지
          스크롤로 내려서 본다. 장중 실시간이라 위 보드의 "정적인 하루 한 번
          발행" 리듬과는 성격이 달라서 굳이 위 레이아웃에 끼워 넣지 않았다. */}
      <IntradaySignalPanel />
    </main>
  );
}
