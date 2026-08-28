import { NextRequest, NextResponse } from "next/server";
import { getPortfolioSettings, updatePortfolioSettings, type PortfolioSettingsData } from "@/lib/portfolio";

export async function GET() {
  const settings = await getPortfolioSettings();
  return NextResponse.json(settings);
}

const NUMERIC_KEYS: (keyof PortfolioSettingsData)[] = [
  "totalSeed",
  "cashAmount",
  "bondAmount",
  "altAssetAmount",
  "targetStockPct",
  "targetBondPct",
  "targetAltPct",
  "targetCashPct",
];

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const input: Partial<PortfolioSettingsData> = {};
  for (const key of NUMERIC_KEYS) {
    const v = Number(body?.[key]);
    if (Number.isFinite(v)) input[key] = v;
  }
  try {
    const updated = await updatePortfolioSettings(input);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "설정을 저장하지 못했어요" }, { status: 400 });
  }
}
