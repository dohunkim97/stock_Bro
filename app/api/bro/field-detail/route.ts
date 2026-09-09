import { NextRequest, NextResponse } from "next/server";
import {
  getBusinessDetail,
  getMarketDetail,
  getVolumeDetail,
  getChartDetail,
  getMaterialDetail,
  getSupplyDetail,
  getFinancialDetail,
  type FieldKey,
} from "@/lib/field-detail";

// "business" 필드는 DART document.xml 왕복이 (실측) icn1→DART 경로에서
// 고정적으로 ~18초 걸리고 그 뒤 LLM 요약까지 붙어서 30초로는 빠듯하다
// (lib/dart.ts의 BUNDLE_BUDGET_MS 주석 참고) — 다른 6개 필드는 원래도
// 훨씬 짧게 끝나니 이 상한을 늘려도 손해가 없다.
export const maxDuration = 45;

const FIELD_KEYS: FieldKey[] = ["business", "market", "volume", "chart", "material", "supply", "financial"];

// 골구 종목 근거의 항목(사업요약/시황/거래량/차트/재료/수급/재무)을 클릭했을
// 때 그 하나만 심층으로 불러오는 지연 로딩 라우트 — components/bro/
// field-detail-modal.tsx가 모달을 열 때 호출한다.
export async function GET(req: NextRequest) {
  const field = req.nextUrl.searchParams.get("field") as FieldKey | null;
  const code = req.nextUrl.searchParams.get("code");
  const name = req.nextUrl.searchParams.get("name");
  const reasoning = req.nextUrl.searchParams.get("reasoning") ?? "";

  if (!field || !FIELD_KEYS.includes(field)) {
    return NextResponse.json({ error: "invalid field" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    switch (field) {
      case "business":
        if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
        return NextResponse.json(await getBusinessDetail(name, code));
      case "market":
        return NextResponse.json(await getMarketDetail(name, reasoning));
      case "volume":
        if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
        return NextResponse.json(await getVolumeDetail(code));
      case "chart":
        if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
        return NextResponse.json(await getChartDetail(code));
      case "material":
        return NextResponse.json(await getMaterialDetail(name, reasoning));
      case "supply":
        if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
        return NextResponse.json(await getSupplyDetail(code));
      case "financial":
        if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
        return NextResponse.json(await getFinancialDetail(code));
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "상세 정보를 불러오지 못했어요";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
