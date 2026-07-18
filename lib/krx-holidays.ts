// Static KRX market-closed calendar (public holidays + KRX's own year-end
// closure), used to skip non-trading days in the market home date nav.
//
// This is a best-effort manually maintained list, not fetched from an
// official source — no data.go.kr holiday API is wired in yet, and would
// need its own separate 활용신청 approval like the other data.go.kr APIs
// this app uses. Fixed solar-calendar dates (New Year, 어린이날, 한글날,
// 크리스마스 등) should be reliable; lunar-calendar dates (설날, 부처님오신날,
// 추석) and 대체공휴일 (substitute holiday) dates are best-effort and worth
// double-checking against an official KRX calendar. Update this list each
// year — it currently only covers 2026.
export const KRX_HOLIDAYS_2026 = new Set([
  "2026-01-01", // 신정
  "2026-02-16", // 설 연휴
  "2026-02-17", // 설날
  "2026-02-18", // 설 연휴
  "2026-03-01", // 삼일절 (일요일)
  "2026-03-02", // 삼일절 대체공휴일
  "2026-05-05", // 어린이날
  "2026-05-24", // 부처님오신날 (일요일)
  "2026-05-25", // 부처님오신날 대체공휴일
  "2026-06-06", // 현충일 (토요일)
  "2026-08-15", // 광복절 (토요일)
  "2026-08-17", // 광복절 대체공휴일
  "2026-09-24", // 추석 연휴
  "2026-09-25", // 추석
  "2026-09-26", // 추석 연휴 (토요일)
  "2026-09-28", // 추석 대체공휴일 (best-effort)
  "2026-10-03", // 개천절 (토요일)
  "2026-10-05", // 개천절 대체공휴일
  "2026-10-09", // 한글날
  "2026-12-25", // 크리스마스
  "2026-12-31", // KRX 연말 폐장일
]);

export function isKrxHoliday(iso: string): boolean {
  return KRX_HOLIDAYS_2026.has(iso);
}
