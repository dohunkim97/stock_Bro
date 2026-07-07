import * as XLSX from "xlsx";
import { STORAGE_CAP, type UploadRow } from "@/lib/market-data";

export type ParsedWorkbook = {
  volume: UploadRow[];
  gainer: UploadRow[];
  errors: string[];
  warnings: string[];
};

const VOLUME_SHEET_NAMES = ["거래량상위", "거래량 상위"];
const GAINER_SHEET_NAMES = ["급상승", "급상승종목", "급상승 종목"];

function findSheet(
  wb: XLSX.WorkBook,
  names: string[],
  fallbackIndex: number
): XLSX.WorkSheet | null {
  for (const n of names) {
    if (wb.Sheets[n]) return wb.Sheets[n];
  }
  const sheetName = wb.SheetNames[fallbackIndex];
  return sheetName ? wb.Sheets[sheetName] : null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[%,]/g, "")
    .replace(/^\+/, "");
  return parseFloat(cleaned);
}

function str(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

function parseRows(
  sheet: XLSX.WorkSheet,
  sheetLabel: string
): { rows: UploadRow[]; errors: string[]; warnings: string[] } {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const rows: UploadRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  raw.slice(0, STORAGE_CAP).forEach((row, i) => {
    const name = str(row, "종목명");
    if (!name) return;

    const price = str(row, "현재가");
    const changePct = toNumber(row["등락률"]);

    if (!price || Number.isNaN(changePct)) {
      errors.push(
        `[${sheetLabel}] ${i + 2}행 (${name}): 현재가·등락률 값을 확인해주세요`
      );
      return;
    }

    const rank = Number(row["순위"]) || rows.length + 1;
    rows.push({
      rank,
      name,
      market: str(row, "시장"),
      price,
      changePct,
      volume: str(row, "거래량") || undefined,
      tradingValue: str(row, "거래대금") || undefined,
      marketCap: str(row, "시가총액") || undefined,
      per: str(row, "PER") || undefined,
      pbr: str(row, "PBR") || undefined,
      roe: str(row, "ROE") || undefined,
      debtRatio: str(row, "부채비율") || undefined,
      reserveRatio: str(row, "유보율") || undefined,
    });
  });

  if (raw.length > STORAGE_CAP) {
    warnings.push(
      `[${sheetLabel}] ${STORAGE_CAP}종목까지만 반영돼요 — 나머지 ${
        raw.length - STORAGE_CAP
      }개 행은 무시했어요`
    );
  }

  return { rows, errors, warnings };
}

export function parseWorkbook(buffer: Buffer): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const errors: string[] = [];
  const warnings: string[] = [];

  const volSheet = findSheet(wb, VOLUME_SHEET_NAMES, 0);
  const gainSheet = findSheet(wb, GAINER_SHEET_NAMES, 1);

  let volume: UploadRow[] = [];
  let gainer: UploadRow[] = [];

  if (volSheet) {
    const r = parseRows(volSheet, "거래량상위");
    volume = r.rows;
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  } else {
    errors.push("'거래량상위' 시트를 찾을 수 없어요.");
  }

  if (gainSheet) {
    const r = parseRows(gainSheet, "급상승");
    gainer = r.rows;
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  } else {
    errors.push("'급상승' 시트를 찾을 수 없어요.");
  }

  return { volume, gainer, errors, warnings };
}
