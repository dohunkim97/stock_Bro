import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  const volumeRows = [
    { 순위: 1, 종목명: "삼성전자", 시장: "코스피", 현재가: "71,200", 등락률: 1.85, 거래량: "2,180만주" },
    { 순위: 2, 종목명: "SK하이닉스", 시장: "코스피", 현재가: "245,000", 등락률: 4.21, 거래량: "620만주" },
  ];
  const gainerRows = [
    { 순위: 1, 종목명: "제주반도체", 시장: "코스닥", 현재가: "9,840", 등락률: 12.34 },
    { 순위: 2, 종목명: "한미반도체", 시장: "코스닥", 현재가: "148,500", 등락률: 6.06 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(volumeRows), "거래량상위");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gainerRows), "급상승");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="stock_note_template.xlsx"',
    },
  });
}
