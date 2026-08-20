"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 60_000;

// A server component only re-fetches its data on navigation/reload — an
// open tab would otherwise sit on whatever it rendered at first load, even
// though the underlying data keeps moving (cron-synced DB rows on /market,
// or a live KIS quote on /bro's CandidateTracker). router.refresh()
// re-runs the page's server-side render so an open tab catches up on its
// own without the user needing to reload.
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
