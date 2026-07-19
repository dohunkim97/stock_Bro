import type { UploadRow } from "@/lib/market-data";
import { fetchFinancialRatiosByCode, type FinancialRatios } from "@/lib/krx-financials";

// data.go.kr — 금융위원회_주식시세정보 (KRX daily price info)
// https://www.data.go.kr/data/15094808/openapi.do
const API_BASE =
  "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo";

type RawKrxRow = {
  name: string;
  code: string;
  market: string;
  price: number;
  changePct: number;
  volume: number;
  tradingValue: number;
  marketCap: number;
  sharesOutstanding: number;
};

function formatWon(value: number): string {
  const EOK = 100_000_000;
  const JO = EOK * 10_000;
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value >= JO) {
    const jo = Math.floor(value / JO);
    const eok = Math.round((value % JO) / EOK);
    return eok > 0 ? `${jo}조 ${eok.toLocaleString()}억` : `${jo}조`;
  }
  if (value >= EOK) return `${Math.round(value / EOK).toLocaleString()}억`;
  return `${value.toLocaleString()}원`;
}

function formatShares(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  const man = value / 10_000;
  return man >= 1 ? `${Math.round(man).toLocaleString()}만주` : `${value.toLocaleString()}주`;
}

function normalizeMarket(raw: unknown): string {
  const v = String(raw ?? "").toUpperCase();
  if (v.includes("KOSDAQ")) return "코스닥";
  if (v.includes("KOSPI")) return "코스피";
  return String(raw ?? "");
}

async function fetchAllRows(basDt: string, serviceKey: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let pageNo = 1;
  const numOfRows = 1000;

  while (true) {
    const url = new URL(API_BASE);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("resultType", "json");
    url.searchParams.set("basDt", basDt);
    url.searchParams.set("numOfRows", String(numOfRows));
    url.searchParams.set("pageNo", String(pageNo));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`KRX API 요청 실패 (HTTP ${res.status})`);
    const json = await res.json();

    const header = json?.response?.header;
    if (header && header.resultCode !== "00") {
      throw new Error(`KRX API 오류: ${header.resultCode} ${header.resultMsg ?? ""}`);
    }

    const body = json?.response?.body;
    const items = body?.items?.item;
    const batch: Record<string, unknown>[] = Array.isArray(items) ? items : items ? [items] : [];
    rows.push(...batch);

    const totalCount = Number(body?.totalCount ?? rows.length);
    if (rows.length >= totalCount || batch.length === 0) break;
    pageNo += 1;
    if (pageNo > 10) break; // safety cap (~10,000 rows)
  }

  return rows;
}

function parseRow(item: Record<string, unknown>): RawKrxRow | null {
  const name = String(item.itmsNm ?? "").trim();
  const codeRaw = String(item.srtnCd ?? "").trim();
  const code = codeRaw.replace(/[^0-9]/g, "").slice(-6).padStart(6, "0");
  if (!name || code.length !== 6) return null;

  const price = Number(item.clpr);
  const changePct = Number(item.fltRt);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null;

  return {
    name,
    code,
    market: normalizeMarket(item.mrktCtg),
    price,
    changePct,
    volume: Number(item.trqu) || 0,
    tradingValue: Number(item.trPrc) || 0,
    marketCap: Number(item.mrktTotAmt) || 0,
    sharesOutstanding: Number(item.lstgStCnt) || 0,
  };
}

function topN(rows: RawKrxRow[], by: (r: RawKrxRow) => number, n: number): RawKrxRow[] {
  return [...rows].sort((a, b) => by(b) - by(a)).slice(0, n);
}

function toUploadRows(rows: RawKrxRow[], ratios: Map<string, FinancialRatios>): UploadRow[] {
  return rows.map((r, i) => {
    const fin = ratios.get(r.code);
    return {
      rank: i + 1,
      name: r.name,
      code: r.code,
      market: r.market,
      price: r.price.toLocaleString(),
      changePct: r.changePct,
      volume: formatShares(r.volume),
      tradingValue: formatWon(r.tradingValue),
      marketCap: formatWon(r.marketCap),
      per: fin?.per,
      pbr: fin?.pbr,
      roe: fin?.roe,
      debtRatio: fin?.debtRatio,
    };
  });
}

export async function fetchKrxDayRanking(
  basDt: string
): Promise<{ volume: UploadRow[]; gainer: UploadRow[]; rawCount: number }> {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) throw new Error("KRX_SERVICE_KEY가 설정되어 있지 않아요.");

  const raw = await fetchAllRows(basDt, serviceKey);
  const rows = raw.map(parseRow).filter((r): r is RawKrxRow => r !== null);

  const kospi = rows.filter((r) => r.market === "코스피");
  const kosdaq = rows.filter((r) => r.market === "코스닥");

  // Pull well beyond the 10 shown by default on the home screen — "더보기"
  // on the market home tables needs real extra rows to expand into.
  const SYNC_TOP_N = 30;
  const volumeTop = [
    ...topN(kospi, (r) => r.volume, SYNC_TOP_N),
    ...topN(kosdaq, (r) => r.volume, SYNC_TOP_N),
  ];
  const gainerTop = [
    ...topN(kospi, (r) => r.changePct, SYNC_TOP_N),
    ...topN(kosdaq, (r) => r.changePct, SYNC_TOP_N),
  ];

  // Financial ratios (PER/PBR/ROE/부채비율) are a best-effort enrichment on
  // top of the core ranking — if data.go.kr's financial APIs are slow, rate
  // limited, or a stock's crno lookup fails, those columns just stay blank
  // rather than failing the whole sync. Budget is capped well under the
  // route's 60s maxDuration so there's always room left for the DB write.
  const ratios = await fetchFinancialRatiosByCode(
    [...volumeTop, ...gainerTop].map((r) => ({
      code: r.code,
      price: r.price,
      sharesOutstanding: r.sharesOutstanding,
    })),
    30000
  );

  return {
    volume: toUploadRows(volumeTop, ratios),
    gainer: toUploadRows(gainerTop, ratios),
    rawCount: rows.length,
  };
}
