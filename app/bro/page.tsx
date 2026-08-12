import { BroChat } from "@/components/bro/bro-chat";
import { PredictionPanel } from "@/components/bro/prediction-panel";

// PredictionPanel does a handful of live KIS quote lookups (one per
// predicted candidate) on every render — cheap individually, but give this
// page the same headroom the stock detail page gets rather than the
// platform's short default.
export const maxDuration = 30;

// This page has no searchParams/cookies to read, so Next would otherwise
// statically prerender it at build time and freeze PredictionPanel's live
// price data forever — force it to render fresh on every request instead.
export const dynamic = "force-dynamic";

export default function BroPage() {
  return (
    <main
      style={{
        maxWidth: 1220,
        margin: "0 auto",
        padding: "26px 24px 60px",
        display: "flex",
        gap: 20,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 640px", maxWidth: 820, minWidth: 0 }}>
        <BroChat />
      </div>
      <div style={{ flex: "1 1 320px", maxWidth: 380, minWidth: 280 }}>
        <PredictionPanel />
      </div>
    </main>
  );
}
