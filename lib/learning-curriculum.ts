// "주식 학습 플래닛" 180일 커리큘럼 — 사용자가 직접 설계해서 보내준 플랜을
// 그대로 코드로 옮겼다. 1주 차(Day 1~7)는 사용자 원문에 날짜별 주제·질문이
// 정확히 적혀 있어서 그대로 하드코딩했고, 그 뒤(Day 8~180)는 원문이 "이번
// 달의 주제 목록"만 주고 날짜별로 쪼개진 내용까진 안 줬다 — 없는 걸 있는
// 척 지어내지 않고, 그 달의 주제 목록을 평일마다 순서대로 돌리는 방식으로
// 코드가 결정적으로(매번 같게) 배정한다. 그날의 구체적인 "오늘의 질문"은
// 주제가 정해진 뒤 LLM이 그 주제에 맞게 만든다(lib/learning-push.ts).
// 7일마다(Day 7, 14, 21 ...) 그 주 동안 배운 걸 복습하는 날로 둔다 — 이것도
// 원문 Day 7("주간 복습")의 패턴을 그대로 180일 전체에 반복 적용한 것.

export const TOTAL_DAYS = 180;

export type MonthPlan = {
  month: number; // 1~6
  dayRange: [number, number];
  title: string;
  goal: string;
  topics: string[]; // 이 달에 다루는 주제들 — 평일마다 순서대로 배정
  milestone: string; // 월말 결과물
};

export const MONTH_PLANS: MonthPlan[] = [
  {
    month: 1,
    dayRange: [1, 30],
    title: "기초 체력: 주식시장과 재무제표",
    goal: "기업이 돈을 버는 구조와 주가가 움직이는 기본 원리를 이해한다.",
    topics: [
      "주식·시가총액·유통주식·거래대금",
      "매출·영업이익·순이익·EPS·ROE",
      "재무상태표·손익계산서·현금흐름표",
      "PER·PBR·PSR·배당수익률",
      "DART 공시 읽는 법",
    ],
    milestone: "상장기업 5곳의 기초 분석표 작성",
  },
  {
    month: 2,
    dayRange: [31, 60],
    title: "가격의 언어: 차트·거래량·수급",
    goal: "가격 변화가 어떤 매수·매도 압력과 연결되는지 해석한다.",
    topics: ["캔들·거래량·갭", "이동평균선과 추세", "지지·저항과 돌파 실패", "RSI·변동성·ATR", "외국인·기관 수급", "거래량 급증과 과열 구분"],
    milestone: "차트 사례 20개 분석 및 실패 사례 정리",
  },
  {
    month: 3,
    dayRange: [61, 90],
    title: "거시경제와 시장의 연결",
    goal: "금리·환율·유가·경기가 업종과 기업에 미치는 영향을 설명한다.",
    topics: [
      "한국은행·미국 연준과 금리",
      "물가·고용·GDP·경기 사이클",
      "원/달러 환율과 수출·수입 기업",
      "국채금리와 성장주 밸류에이션",
      "유가·원자재·해운·정유·화학",
      "반도체·전력기기·조선 등 산업 연결고리",
    ],
    milestone: "시장 변화 시나리오 4개 작성",
  },
  {
    month: 4,
    dayRange: [91, 120],
    title: "기업 분석 심화: 숫자 속에 숨은 이야기",
    goal: "실적의 질과 기업의 위험 신호를 찾는다.",
    topics: [
      "영업이익률과 ROE의 변화",
      "영업현금흐름과 순이익의 차이",
      "재고·매출채권 증가와 현금 회수",
      "부채 만기·이자비용·유동성",
      "CB·BW·유상증자·주식 희석",
      "최대주주·특수관계인·지배구조",
      "사업보고서와 주석 분석",
    ],
    milestone: "기업 심층 분석 보고서 5개",
  },
  {
    month: 5,
    dayRange: [121, 150],
    title: "투자 전략 설계와 검증",
    goal: "감에 의존하는 매매에서 검증 가능한 전략으로 발전한다.",
    topics: [
      "진입·청산 규칙",
      "손익비와 손익분기 승률",
      "최대낙폭(MDD)과 포지션 크기",
      "거래비용·슬리피지",
      "과거 데이터 백테스트",
      "과최적화와 미래정보 누수 방지",
      "전략별 성과 비교",
    ],
    milestone: "명확한 규칙을 가진 전략 1개와 검증 보고서",
  },
  {
    month: 6,
    dayRange: [151, 180],
    title: "통합 투자 시스템과 골구 구축",
    goal: "배운 지식을 실제 분석 프로세스와 자동화 시스템으로 연결한다.",
    topics: [
      "시장·업종·기업 분석 통합",
      "종목 선정 기준 점수화",
      "보유종목 위험 감시",
      "목표가·손절가 산출 근거 기록",
      "예측과 실제 결과 비교",
      "골구의 판단 이력·근거 저장",
      "월간 투자 성과와 오류 분석",
    ],
    milestone: "투자 연구 시스템과 180일 학습 성과 보고서",
  },
];

// Day 1~7 — 사용자 원문에 날짜별로 정확히 적힌 내용 그대로.
const WEEK1_FIXED: { day: number; topic: string; question: string }[] = [
  { day: 1, topic: "주식시장 구조", question: "주가가 같아도 시가총액이 다른 이유는?" },
  { day: 2, topic: "주가와 수익률", question: "-50% 손실 후 원금 회복에 몇 % 상승이 필요한가?" },
  { day: 3, topic: "매출과 이익", question: "매출이 증가해도 영업이익이 감소하는 이유는?" },
  { day: 4, topic: "재무상태표", question: "자산이 늘어도 기업이 위험해질 수 있는 이유는?" },
  { day: 5, topic: "현금흐름표", question: "흑자 기업이 현금 부족에 빠질 수 있는 이유는?" },
  { day: 6, topic: "재무비율", question: "이익률이 높은 기업이 반드시 좋은 투자 대상일까?" },
  { day: 7, topic: "주간 복습", question: "이번 주 가장 이해가 부족한 개념은?" },
];

export function monthForDay(day: number): MonthPlan {
  const clamped = Math.min(Math.max(day, 1), TOTAL_DAYS);
  return MONTH_PLANS.find((m) => clamped >= m.dayRange[0] && clamped <= m.dayRange[1]) ?? MONTH_PLANS[MONTH_PLANS.length - 1];
}

export type DailyTopic = {
  day: number;
  month: MonthPlan;
  topic: string;
  question: string | null; // Day 1~7만 고정 질문이 있음 — 나머진 null(호출부가 LLM으로 생성)
  isWeeklyReview: boolean; // 7일마다(원문 Day 7의 패턴을 180일 전체에 반복)
};

// 그날의 주제를 결정적으로 정한다 — 같은 day를 넣으면 항상 같은 결과(LLM 없이
// 코드만으로). Day 1~7은 고정 내용 그대로, 그 뒤는 그 달의 topics를 평일
// 진행 순서(0,1,2...)로 순환 배정한다.
export function dailyTopicFor(day: number): DailyTopic {
  const month = monthForDay(day);
  const isWeeklyReview = day % 7 === 0;

  if (day <= 7) {
    const fixed = WEEK1_FIXED[day - 1];
    return { day, month, topic: fixed.topic, question: fixed.question, isWeeklyReview };
  }

  const dayWithinMonth = day - month.dayRange[0]; // 0-based
  const topic = month.topics[dayWithinMonth % month.topics.length];
  return { day, month, topic: isWeeklyReview ? `주간 복습 — ${topic}` : topic, question: null, isWeeklyReview };
}

// 원문 플랜의 6단계 "스스로 조사" 루틴 — 2026-10-16부터 기본 학습자료
// 발송에는 안 쓴다(사용자가 숙제형보다 강의형+질문 흐름을 원해서,
// lib/learning-push.ts의 buildDailyMissionMessage 참고). 데이터는 남겨둔다 —
// 나중에 "오늘 실습 체크리스트 줘" 같은 별도 요청을 만들면 다시 쓸 수 있다.
export const DAILY_ROUTINE_STEPS = [
  "① 시장 온도 측정 — 코스피/코스닥/미국지수, 환율·금리·유가, 외국인·기관 동향, 오늘 시장을 움직인 핵심 원인 1개",
  "② 뉴스·공시 해부 — 관심종목 뉴스 3개, DART 공시 1개, 사실과 해석 구분",
  "③ 기업 한 곳 깊게 분석 — 무엇을 팔아 돈을 버는지, 최근 실적, 부채·현금흐름, 경쟁사 비교",
  "④ 차트·수급 분석 — 거래량 증가 이유, 지지/저항, 수급과 주가 비교, 추세인지 과열인지",
  "⑤ 투자 판단 기록 — 내일 오를 것 같은 종목 1개, 근거 3개/위험 3개, 틀렸다고 볼 조건",
  "⑥ 복습·골구 기록 — 오늘 배운 것 3줄, 틀렸던 판단과 이유 → 골구에게 기록해줘(record_learning_journal)",
];
