import zlib from "zlib";
import iconv from "iconv-lite";

// KIS's daily-refreshed 종목마스터 files — the full KOSPI/KOSDAQ listed-stock
// code↔name mapping. There's no live "종목명으로 코드 검색" REST endpoint in
// the KIS API (verified against koreainvestment/open-trading-api's own
// stocks_info/ examples — they resolve names the same way, by downloading
// these files), so this is the only way to resolve an LLM-picked company
// name to a code when it isn't already in our own StockMaster DB (which
// only ever contains stocks that have shown up in a synced ranking).
const MASTER_FILES: { market: string; url: string; trailingBytes: number }[] = [
  { market: "코스피", url: "https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip", trailingBytes: 228 },
  { market: "코스닥", url: "https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip", trailingBytes: 222 },
];

const FETCH_TIMEOUT_MS = 15000;

// These master files are always a single stored/deflated entry, so a full
// zip library is unnecessary — Node's built-in zlib covers the one
// compression method (deflate) real-world .mst.zip files use. Verified
// against the live files before writing this (local header layout, deflate
// method, decompressed size all matched).
function unzipSingleEntry(buf: Buffer): Buffer {
  const method = buf.readUInt16LE(8);
  const compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataStart = 30 + nameLen + extraLen;
  const compData = buf.subarray(dataStart, dataStart + compSize);
  return method === 8 ? zlib.inflateRawSync(compData) : Buffer.from(compData);
}

export type CodeMasterEntry = { code: string; name: string; market: string };

async function fetchOneMarket(market: string, url: string, trailingBytes: number): Promise<CodeMasterEntry[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const zipBuf = Buffer.from(await res.arrayBuffer());
    const mstBuf = unzipSingleEntry(zipBuf);
    const text = iconv.decode(mstBuf, "cp949");
    const lines = text.split(/\r?\n/).filter(Boolean);

    return lines
      .map((row) => {
        // Fixed-width row: [단축코드 9][표준코드 12][한글명 ...][market-specific
        // numeric fields, trailingBytes long]. Only 단축코드(code)/한글명(name)
        // are needed here.
        const part1 = row.slice(0, row.length - trailingBytes);
        return { code: part1.slice(0, 9).trim(), name: part1.slice(21).trim(), market };
      })
      // The files also list ETFs/ETNs/preferred shares/funds under longer
      // or non-numeric codes (e.g. "0162Z0", "Q520100") — restricting to
      // plain 6-digit codes keeps this to ordinary common stock, which is
      // what an LLM-predicted company name should resolve to.
      .filter((e) => /^[0-9]{6}$/.test(e.code) && e.name);
  } catch {
    return [];
  }
}

// Downloads and parses both markets' master files fresh — this is only
// ever called as a fallback when resolveStock() (our own DB) can't find a
// candidate's code, which happens for at most a handful of names per
// weekly-prediction generation run, so re-fetching each time (rather than
// caching) is simpler and cheap enough not to matter.
export async function fetchKisCodeMaster(): Promise<CodeMasterEntry[]> {
  const results = await Promise.all(MASTER_FILES.map((m) => fetchOneMarket(m.market, m.url, m.trailingBytes)));
  return results.flat();
}

export function findInCodeMaster(codeMaster: CodeMasterEntry[], name: string): CodeMasterEntry | null {
  const trimmed = name.trim();
  const exact = codeMaster.find((e) => e.name === trimmed);
  if (exact) return exact;
  const partial = codeMaster.find((e) => e.name.includes(trimmed) || trimmed.includes(e.name));
  return partial ?? null;
}
