import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const SAMPLE_VOLUME = [
  {
    순위: 1,
    종목명: "삼성전자",
    시장: "코스피",
    현재가: "71,200",
    등락률: 1.85,
    거래량: "2,180만주",
    거래대금: "1조 5,520억",
    시가총액: "425조",
    PER: "14.2",
    PBR: "1.3",
    ROE: "9.8%",
    부채비율: "38%",
    유보율: "32,400%",
  },
  {
    순위: 2,
    종목명: "SK하이닉스",
    시장: "코스피",
    현재가: "245,000",
    등락률: 4.21,
    거래량: "620만주",
    거래대금: "1조 5,190억",
    시가총액: "178조",
    PER: "9.8",
    PBR: "2.1",
    ROE: "24.5%",
    부채비율: "45%",
    유보율: "8,200%",
  },
];

const SAMPLE_GAINER = [
  {
    순위: 1,
    종목명: "제주반도체",
    시장: "코스닥",
    현재가: "9,840",
    등락률: 12.34,
    거래량: "1,860만주",
    거래대금: "1,830억",
    시가총액: "3,200억",
    PER: "22.1",
    PBR: "3.4",
    ROE: "15.2%",
    부채비율: "28%",
    유보율: "1,150%",
  },
  {
    순위: 2,
    종목명: "한미반도체",
    시장: "코스닥",
    현재가: "148,500",
    등락률: 6.06,
    거래량: "940만주",
    거래대금: "1조 3,960억",
    시가총액: "14.4조",
    PER: "62.3",
    PBR: "12.1",
    ROE: "19.4%",
    부채비율: "25%",
    유보율: "2,800%",
  },
];

export async function GET() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(SAMPLE_VOLUME), "거래량상위");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(SAMPLE_GAINER), "급상승");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="stock_note_template.xlsx"',
    },
  });
}
