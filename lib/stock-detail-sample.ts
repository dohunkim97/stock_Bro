// Detail sections (chart / valuation / financials / revenue mix / competitors)
// are kept as the 한미반도체 sample from the design mockup regardless of which stock
// is selected in the picker — see chats/chat1.md: "종목을 바꾸면 상단 식별 정보는
// 갱신되지만, 아래 상세 분석은 아직 한미반도체 샘플이 그대로 표시됩니다."
// (뉴스 섹션만 예외 — components/stock/detail-sections.tsx에서 네이버 뉴스
// 검색으로 실제 데이터를 가져와요.)

export const chartPoints =
  "0,175 40,168 80,180 120,150 160,158 200,130 240,138 280,105 320,118 360,88 400,96 440,70 480,82 520,52 560,60 600,34 620,30";

export const chartRanges = [
  { label: "1M", active: false },
  { label: "3M", active: true },
  { label: "1Y", active: false },
  { label: "전체", active: false },
];

export const valuation = [
  { label: "시가총액", value: "14.4조", sub: "KOSDAQ 3위" },
  { label: "PER", value: "62.3", sub: "업종 평균 24.1" },
  { label: "PBR", value: "12.1", sub: "업종 평균 3.8" },
  { label: "배당수익률", value: "0.4%", sub: "연 600원" },
];

export const financials = [
  { label: "매출액", y23: "1,590", y24: "2,861", y25: "5,500", up: true },
  { label: "영업이익", y23: "311", y24: "785", y25: "1,870", up: true },
  { label: "순이익", y23: "288", y24: "712", y25: "1,650", up: true },
  { label: "부채비율", y23: "31%", y24: "28%", y25: "25%", up: false },
];

export const revenueMix = [
  { name: "HBM 본더 (TC본더)", pct: 65, color: "var(--accent)" },
  { name: "비전 플레이스먼트", pct: 20, color: "var(--down)" },
  { name: "기타 반도체 장비", pct: 15, color: "var(--faint)" },
];

export const competitors = [
  { name: "한미반도체", tag: "본사", mcap: "14.4조", per: "62.3", margin: "34%", growth: "+92%", up: true, highlight: true },
  { name: "ASMPT", tag: "HK", mcap: "5.2조", per: "28.4", margin: "12%", growth: "+18%", up: true, highlight: false },
  { name: "BESI", tag: "NL", mcap: "11.8조", per: "41.2", margin: "31%", growth: "+24%", up: true, highlight: false },
  { name: "원익IPS", tag: "KR", mcap: "1.9조", per: "19.6", margin: "9%", growth: "-4%", up: false, highlight: false },
];
