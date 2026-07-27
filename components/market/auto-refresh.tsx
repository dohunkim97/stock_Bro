"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 60_000;

// Cron keeps the DB fresh with live KIS data every 15 min during market
// hours, but a server component only re-fetches on navigation/reload — an
// open tab would otherwise sit on whatever it rendered at first load.
// router.refresh() re-runs the page's server-side data fetch (a cheap DB
// read, no external API call) so an open 오늘 market page catches up on its
// own without the user needing to click 새로고침.
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
