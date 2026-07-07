// Detail sections (chart / valuation / financials / revenue mix / news / competitors)
// are kept as the 한미반도체 sample from the design mockup regardless of which stock
// is selected in the picker — see chats/chat1.md: "종목을 바꾸면 상단 식별 정보는
// 갱신되지만, 아래 상세 분석은 아직 한미반도체 샘플이 그대로 표시됩니다."

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

export const news = [
  { date: "07.06", tag: "실적", tagBg: "var(--up-soft)", tagColor: "var(--up)", title: "한미반도체, 2분기 영업이익 컨센서스 상회 전망… TC본더 수주 급증", source: "한국경제 · 3시간 전" },
  { date: "07.04", tag: "수주", tagBg: "var(--accent-soft)", tagColor: "var(--accent)", title: "SK하이닉스 HBM4용 신규 본더 라인 발주… 하반기 매출 반영 기대", source: "전자신문 · 2일 전" },
  { date: "07.02", tag: "산업", tagBg: "var(--down-soft)", tagColor: "var(--down)", title: "엔비디아 차세대 GPU 수요 확대에 HBM 밸류체인 동반 강세", source: "머니투데이 · 4일 전" },
  { date: "06.28", tag: "리스크", tagBg: "var(--down-soft)", tagColor: "var(--down)", title: "고객사 편중·환율 변동성은 잠재 리스크… 밸류에이션 부담 지적도", source: "이데일리 · 8일 전" },
];

export const competitors = [
  { name: "한미반도체", tag: "본사", mcap: "14.4조", per: "62.3", margin: "34%", growth: "+92%", up: true, highlight: true },
  { name: "ASMPT", tag: "HK", mcap: "5.2조", per: "28.4", margin: "12%", growth: "+18%", up: true, highlight: false },
  { name: "BESI", tag: "NL", mcap: "11.8조", per: "41.2", margin: "31%", growth: "+24%", up: true, highlight: false },
  { name: "원익IPS", tag: "KR", mcap: "1.9조", per: "19.6", margin: "9%", growth: "-4%", up: false, highlight: false },
];
