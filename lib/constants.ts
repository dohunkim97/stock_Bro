// Shared constants with no server-only dependencies, safe to import from
// client components. lib/market-data.ts re-exports STORAGE_CAP for
// server-side callers that already import it.
export const STORAGE_CAP = 100;
