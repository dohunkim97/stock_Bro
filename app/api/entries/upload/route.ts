import { NextRequest, NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/excel-import";
import { replaceDayEntries } from "@/lib/market-data";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const date = form.get("date");
  const file = form.get("file");

  if (typeof date !== "string" || !date) {
    return NextResponse.json({ error: "날짜가 없어요" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일을 선택해주세요" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseWorkbook(buffer);
  } catch {
    return NextResponse.json(
      { error: "엑셀 파일을 읽지 못했어요. 형식을 확인해주세요." },
      { status: 400 }
    );
  }

  if (parsed.errors.length) {
    return NextResponse.json({ error: parsed.errors.join("\n") }, { status: 400 });
  }
  if (parsed.volume.length === 0 && parsed.gainer.length === 0) {
    return NextResponse.json({ error: "업로드할 데이터가 없어요." }, { status: 400 });
  }

  await replaceDayEntries(date, parsed);

  return NextResponse.json({
    ok: true,
    volumeCount: parsed.volume.length,
    gainerCount: parsed.gainer.length,
    warnings: parsed.warnings,
  });
}
