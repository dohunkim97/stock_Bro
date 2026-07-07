// Weekly/monthly report content ported verbatim from the design mockup.
// These stay as layout-reference sample data — see chats/chat1.md:
// "리포트 수치·문구는 레이아웃 확인용 샘플이고, 날짜별 실제 데이터 저장·집계는
// 개발 단계에서 붙이는 구조로 잡아뒀습니다."

export type ReportData = {
  kicker: string;
  headline: string;
  body: string;
  keywords: { text: string; color: string }[];
  stats: { label: string; value: string; chg: string; up: boolean }[];
  sectors: { name: string; freq: string; pct: string; width: string; hot: boolean }[];
  leaders: { rank: number; name: string; sector: string; freq: string; chg: string }[];
  notes: { icon: string; iconBg: string; iconColor: string; title: string; desc: string }[];
};

export const weekReport: ReportData = {
  kicker: "Weekly Report · 06.30 – 07.06",
  headline: "이번 주는 반도체가 시장을 끌고 갔어",
  body: "5거래일 중 4일에서 상위 종목의 절반 이상이 반도체였어. 엔비디아 차세대 GPU 수요 기대가 HBM 밸류체인 전반으로 번지면서 SK하이닉스·한미반도체가 주간 내내 강세였고, 후공정 장비주(HPSP·이수페타시스)로 온기가 확산됐어. 반면 2차전지는 수급이 빠지며 조정을 받았고, 원전·에너지는 정책 기대로 꾸준히 상위권을 지켰지.",
  keywords: [
    { text: "HBM", color: "var(--accent)" },
    { text: "엔비디아_GPU", color: "var(--up)" },
    { text: "후공정장비", color: "var(--text)" },
    { text: "2차전지_조정", color: "var(--down)" },
  ],
  stats: [
    { label: "KOSPI 주간", value: "2,948", chg: "+2.14%", up: true },
    { label: "KOSDAQ 주간", value: "882", chg: "+3.67%", up: true },
    { label: "반도체 지수", value: "4,120", chg: "+5.9%", up: true },
    { label: "2차전지 지수", value: "1,540", chg: "-2.8%", up: false },
  ],
  sectors: [
    { name: "반도체", freq: "4/5일", pct: "46%", width: "96%", hot: true },
    { name: "AI · 데이터센터", freq: "3/5일", pct: "19%", width: "44%", hot: false },
    { name: "원전 · 에너지", freq: "3/5일", pct: "16%", width: "36%", hot: false },
    { name: "조선 · 방산", freq: "2/5일", pct: "11%", width: "26%", hot: false },
    { name: "2차전지", freq: "1/5일", pct: "8%", width: "18%", hot: false },
  ],
  leaders: [
    { rank: 1, name: "이수페타시스", sector: "반도체", freq: "4회 등장", chg: "+28.4%" },
    { rank: 2, name: "한미반도체", sector: "반도체", freq: "5회 등장", chg: "+21.7%" },
    { rank: 3, name: "HPSP", sector: "반도체", freq: "3회 등장", chg: "+18.2%" },
    { rank: 4, name: "두산에너빌리티", sector: "원전", freq: "3회 등장", chg: "+14.5%" },
    { rank: 5, name: "SK하이닉스", sector: "반도체", freq: "5회 등장", chg: "+12.9%" },
  ],
  notes: [
    { icon: "📈", iconBg: "var(--up-soft)", iconColor: "var(--up)", title: "HBM 실적 시즌 진입", desc: "다음 주 SK하이닉스 잠정실적 발표. HBM4 가이던스가 밸류체인 방향을 가를 이벤트." },
    { icon: "⚠", iconBg: "var(--down-soft)", iconColor: "var(--down)", title: "반도체 쏠림 심화", desc: "상위 종목이 한 섹터에 몰리면 조정 시 변동성이 커져. 분산 여부를 점검할 시점." },
    { icon: "🔁", iconBg: "var(--accent-soft)", iconColor: "var(--accent)", title: "순환매 후보", desc: "조정받은 2차전지·바이오로 단기 순환매가 나올지 거래량 회복을 지켜볼 것." },
    { icon: "🌐", iconBg: "var(--panel)", iconColor: "var(--dim)", title: "대외 변수", desc: "원/달러 환율과 미국 반도체지수(SOX) 흐름이 다음 주 수급의 열쇠." },
  ],
};

export const monthReport: ReportData = {
  kicker: "Monthly Report · 2026.06",
  headline: "6월 한 달, 시장의 주도주는 결국 반도체였어",
  body: "6월 22거래일 동안 반도체는 절반이 넘는 날에 상위권을 지키며 명실상부한 주도 섹터였어. 월 초 조정 이후 HBM 수요 기대가 재점화되며 후반부로 갈수록 강세 폭이 커졌지. 원전·에너지와 조선·방산이 정책·수주 모멘텀으로 뒤를 받쳤고, 2차전지는 월간 기준으로도 부진을 벗어나지 못했어. 지수는 코스닥이 코스피를 뚜렷하게 아웃퍼폼했어.",
  keywords: [
    { text: "HBM_슈퍼사이클", color: "var(--accent)" },
    { text: "코스닥_강세", color: "var(--up)" },
    { text: "원전_수주", color: "var(--text)" },
    { text: "2차전지_부진", color: "var(--down)" },
  ],
  stats: [
    { label: "KOSPI 월간", value: "2,948", chg: "+4.8%", up: true },
    { label: "KOSDAQ 월간", value: "882", chg: "+9.2%", up: true },
    { label: "반도체 지수", value: "4,120", chg: "+16.3%", up: true },
    { label: "2차전지 지수", value: "1,540", chg: "-6.1%", up: false },
  ],
  sectors: [
    { name: "반도체", freq: "13/22일", pct: "52%", width: "98%", hot: true },
    { name: "원전 · 에너지", freq: "9/22일", pct: "18%", width: "42%", hot: false },
    { name: "AI · 데이터센터", freq: "7/22일", pct: "14%", width: "32%", hot: false },
    { name: "조선 · 방산", freq: "5/22일", pct: "10%", width: "24%", hot: false },
    { name: "2차전지", freq: "2/22일", pct: "6%", width: "14%", hot: false },
  ],
  leaders: [
    { rank: 1, name: "한미반도체", sector: "반도체", freq: "18일 등장", chg: "+62.3%" },
    { rank: 2, name: "이수페타시스", sector: "반도체", freq: "14일 등장", chg: "+54.1%" },
    { rank: 3, name: "HPSP", sector: "반도체", freq: "11일 등장", chg: "+41.8%" },
    { rank: 4, name: "SK하이닉스", sector: "반도체", freq: "20일 등장", chg: "+33.5%" },
    { rank: 5, name: "두산에너빌리티", sector: "원전", freq: "9일 등장", chg: "+27.9%" },
  ],
  notes: [
    { icon: "📈", iconBg: "var(--up-soft)", iconColor: "var(--up)", title: "실적으로 증명될 차례", desc: "7월 2분기 실적 시즌. 주가가 선반영한 이익 성장을 실제 숫자가 뒷받침하는지가 관건." },
    { icon: "⚠", iconBg: "var(--down-soft)", iconColor: "var(--down)", title: "밸류에이션 부담", desc: "주도주 PER이 역사적 상단. 좋은 뉴스에도 차익실현이 나올 수 있는 구간." },
    { icon: "🔁", iconBg: "var(--accent-soft)", iconColor: "var(--accent)", title: "소외주 저점 매수", desc: "한 달 내내 눌린 2차전지·바이오의 낙폭과대 반등 가능성을 체크." },
    { icon: "🌐", iconBg: "var(--panel)", iconColor: "var(--dim)", title: "매크로 점검", desc: "금리·환율 방향과 외국인 순매수 지속 여부가 7월 시장 색깔을 결정." },
  ],
};
