// ETF 구성종목시세 — tr_id FHKST121600C0. Endpoint/field names verified
// against KIS's own official example repo (koreainvestment/open-trading-api,
// examples_llm/etfetn/inquire_component_stock_price).
//
// This treats a thematic ETF's real holdings as ground truth for "this
// stock belongs to this theme" — a fund manager put actual money behind
// that classification, which is a stronger signal than an LLM reading a
// news headline (lib/theme-extraction.ts). Used to seed/reinforce
// StockTheme so it doesn't rely on news coverage alone.

import { getKisAccessToken } from "@/lib/kis-token";
import { prisma } from "@/lib/prisma";

const COMPONENT_URL =
  "https://openapi.koreainvestment.com:9443/uapi/etfetn/v1/quotations/inquire-component-stock-price";
const PER_REQUEST_TIMEOUT_MS = 8000;

export type EtfHolding = { code: string; name: string; weightPct: number };

export async function fetchEtfHoldings(etfCode: string): Promise<EtfHolding[]> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return [];

  const token = await getKisAccessToken();
  if (!token) return [];

  const url = new URL(COMPONENT_URL);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", etfCode);
  url.searchParams.set("FID_COND_SCR_DIV_CODE", "11216");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST121600C0",
        custtype: "P",
      },
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.rt_cd !== "0") return [];

    const rows: Record<string, unknown>[] = Array.isArray(json.output2) ? json.output2 : [];
    return rows
      .map((r) => ({
        code: String(r.stck_shrn_iscd ?? "").trim(),
        name: String(r.hts_kor_isnm ?? "").trim(),
        weightPct: Number(r.etf_cnfg_issu_rlim) || 0,
      }))
      .filter((h) => h.code.length === 6 && h.name);
  } catch {
    return [];
  }
}

// Seed list — small on purpose, each code checked against a real fund page
// (not guessed) before being added here. Extend by adding more {code,theme}
// pairs; no other code needs to change.
export const THEME_ETFS: { code: string; theme: string }[] = [
  { code: "305540", theme: "2차전지" }, // TIGER 2차전지테마
  { code: "305720", theme: "2차전지" }, // KODEX 2차전지산업
  { code: "445290", theme: "로봇·휴머노이드" }, // KODEX 로봇액티브
  { code: "244580", theme: "바이오" }, // KODEX 바이오
  { code: "091160", theme: "반도체" }, // KODEX 반도체
];

// ETF holdings are the most authoritative theme source this app has, so
// this upserts unconditionally — a fund's real allocation should win over
// an LLM's read of a headline, not the other way around (see the
// source-startsWith guard in lib/theme-extraction.ts's saveThemes).
export async function syncThemeEtfs(topN = 15): Promise<void> {
  for (const etf of THEME_ETFS) {
    try {
      const holdings = await fetchEtfHoldings(etf.code);
      const top = [...holdings].sort((a, b) => b.weightPct - a.weightPct).slice(0, topN);
      for (const h of top) {
        await prisma.stockTheme.upsert({
          where: { name: h.name },
          create: { name: h.name, theme: etf.theme, code: h.code, source: `ETF 구성종목(${etf.code})` },
          update: { theme: etf.theme, code: h.code, source: `ETF 구성종목(${etf.code})` },
        });
      }
    } catch {
      // best-effort — one ETF failing shouldn't block the others
    }
  }
}
