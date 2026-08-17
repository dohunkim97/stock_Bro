import { DuckLoader } from "@/components/ui/duck-loader";

// Without this, Next has no loading boundary while app/bro/page.tsx waits
// on CandidateTracker's live KIS quote lookups (see maxDuration=30 there,
// plus a DB round trip for the cached KIS token) — clicking "Golgoo" in the
// header would otherwise leave the screen looking frozen for that whole
// stretch, with no sign the click registered.
export default function BroLoading() {
  return (
    <main style={{ maxWidth: 1220, margin: "0 auto", padding: "26px 24px 60px" }}>
      <div
        style={{
          minHeight: "55vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <DuckLoader />
      </div>
    </main>
  );
}
