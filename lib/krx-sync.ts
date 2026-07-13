import type { UploadRow } from "@/lib/market-data";

// data.go.kr — 금융위원회_주식시세정보 (KRX daily price info)
// https://www.data.go.kr/data/15094808/openapi.do
//
// Field names below follow that API's documented response shape. We haven't
// tested against a live service key yet — if the real response differs,
// adjust the field reads in parseRow() rather than the rest of this file.
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
  };
}

function toUploadRows(rows: RawKrxRow[], by: (r: RawKrxRow) => number): UploadRow[] {
  return [...rows]
    .sort((a, b) => by(b) - by(a))
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      market: r.market,
      price: r.price.toLocaleString(),
      changePct: r.changePct,
      volume: formatShares(r.volume),
      tradingValue: formatWon(r.tradingValue),
      marketCap: formatWon(r.marketCap),
    }));
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

  const volume = [
    ...toUploadRows(kospi, (r) => r.volume),
    ...toUploadRows(kosdaq, (r) => r.volume),
  ];
  const gainer = [
    ...toUploadRows(kospi, (r) => r.changePct),
    ...toUploadRows(kosdaq, (r) => r.changePct),
  ];

  return { volume, gainer, rawCount: rows.length };
}
