import { BroChat } from "@/components/bro/bro-chat";
import { CandidateTracker } from "@/components/bro/candidate-tracker";
import { PredictionArchive } from "@/components/bro/prediction-archive";
import { BroSplit } from "@/components/bro/bro-split";

// CandidateTracker does a handful of live KIS quote lookups (one per
// predicted candidate) on every render — cheap individually, but give this
// page the same headroom the stock detail page gets rather than the
// platform's short default.
export const maxDuration = 30;

// This page has no searchParams/cookies to read, so Next would otherwise
// statically prerender it at build time and freeze CandidateTracker's live
// price data forever — force it to render fresh on every request instead.
export const dynamic = "force-dynamic";

export default function BroPage() {
  return (
    <main style={{ maxWidth: 1220, margin: "0 auto", padding: "26px 24px 60px" }}>
      <BroSplit
        left={<BroChat />}
        right={
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <CandidateTracker />
            <PredictionArchive />
          </div>
        }
      />
    </main>
  );
}
