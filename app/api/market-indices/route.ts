import { NextResponse } from "next/server";
import { getMarketIndexQuotes } from "@/lib/kis-index-quote";

// Polled client-side by IndexQuotePanel every 15s for a live-feeling ticker
// — decoupled from the rest of /market's 60s AutoRefresh so this one small
// panel can update faster without re-rendering the whole page each time.
export async function GET() {
  const quotes = await getMarketIndexQuotes();
  return NextResponse.json({ quotes });
}
