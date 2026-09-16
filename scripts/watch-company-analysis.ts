// 로컬 "기업분석" 프로그램이 파일을 쓰는 폴더를 감시하다가, 새 파일이
// 생기거나(add) 기존 파일이 덮어써지면(change) 그 즉시
// lib/company-analysis-import.ts로 DB(CompanyAnalysis 테이블 = 운영
// Neon Postgres)에 올린다. 로컬 파일 → 클라우드 DB → 배포된 사이트가
// 그 DB를 읽는 구조라, 이 스크립트가 켜져 있는 동안만 실시간 반영된다
// (꺼져 있으면 그동안 생긴 파일은 다시 켰을 때의 시작 스캔에서 한 번에
// 잡힌다 — chokidar가 시작 시 기존 파일도 add 이벤트로 한 번씩 흘려줌).
//
// 실행: npm run watch:company-analysis
// (DATABASE_URL 등은 .env에 있는데 Next.js 밖의 순수 node 프로세스라
// 자동으로 안 읽어줘서 prisma/seed.ts와 똑같이 dotenv/config로 직접 로드)

import "dotenv/config";
import chokidar from "chokidar";
import { importCompanyAnalysisFile } from "../lib/company-analysis-import";
import { exportTodayPicks } from "../lib/export-today-picks";

const WATCH_DIR = "C:\\Users\\PC\\Desktop\\바이브 코딩\\다트 데이터\\기업분석 데이터";

// today_picks.json(오늘 골구가 예상한 종목 + 지난 예측 백로그, 최신순·이미
// 분석된 건 제외)도 이 프로세스가 같이 최신으로 유지한다 — 사용자가 매일
// 아침 로컬 분석 스크립트 한 번만 돌려도 그 우선순위 목록이 항상 최신이게
// 하려면(사용자 요청) PC를 며칠 켜둔 채로 로그아웃을 안 해도(그럼 시작
// 스캔이 다시 안 돎) 자동으로 갱신돼야 한다 — 그래서 30분마다 재확인한다.
const TODAY_PICKS_REFRESH_MS = 30 * 60 * 1000;
const RETRY_DELAY_MS = 5000;

// 실측: 이 프로세스를 며칠 켜둔 채로 두니 "today_picks.json 갱신 실패"가
// 여러 회차 연속으로(30분 간격 x 3번 이상) 반복되다 나중에 저절로 풀리는
// 패턴이 관찰됐다 — Neon 같은 서버리스 Postgres는 오래 idle이던 커넥션을
// 서버 쪽에서 먼저 끊어버리는데, 이 타이머는 30분마다 딱 한 번만 쿼리를
// 날려서 그 끊긴 커넥션을 그대로 다시 쓰다 실패하는 것으로 보인다(반면
// 파일 변경 감지 쪽은 이벤트가 몰릴 때 자주 쿼리를 날려서 커넥션이 계속
// 따뜻하게 유지돼 이 문제를 거의 안 겪는다). 첫 시도가 실패하면 바로
// 재시도해서(pg pool이 새 커넥션을 잡게 됨) 다음 30분을 기다리지 않고도
// 대부분 복구되게 한다 — lib/sync-runner.ts의 withRetry와 같은 패턴.
async function refreshTodayPicks() {
  try {
    const result = await exportTodayPicks();
    if (result.changed) log(`📋 today_picks.json 갱신 — ${result.codes.length}개: ${result.codes.join(", ") || "(없음)"}`);
  } catch (e) {
    log(`⚠️  today_picks.json 갱신 실패(재시도 예정): ${describeError(e)}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      const result = await exportTodayPicks();
      if (result.changed) log(`📋 today_picks.json 갱신(재시도 성공) — ${result.codes.length}개: ${result.codes.join(", ") || "(없음)"}`);
      else log("📋 today_picks.json 재시도 성공 — 변동 없음");
    } catch (e2) {
      log(`⚠️  today_picks.json 갱신 실패(재시도도 실패): ${describeError(e2)}`);
    }
  }
}

// e.message만 보면(이전 버그) Prisma/pg 커넥션 에러 중 message가 빈
// 문자열인 경우가 있어 로그가 "실패: " 뒤에 아무것도 안 남아 원인을 전혀
// 알 수 없었다 — name/code/message를 다 모아서 최소한 뭐라도 남긴다.
function describeError(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as { code?: string }).code;
    return [e.name, code, e.message].filter(Boolean).join(" ") || e.stack?.split("\n")[0] || "(빈 에러)";
  }
  return String(e);
}

function log(msg: string) {
  const ts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
  console.log(`[${ts}] ${msg}`);
}

async function handleFile(filePath: string) {
  if (!filePath.endsWith("_analysis.json")) return; // chokidar v4+는 글롭을 안 받아서(디렉터리 통째로 감시) 여기서 직접 거른다
  const result = await importCompanyAnalysisFile(filePath);
  if (result.ok) {
    log(`✅ 반영 완료 — ${result.name} (${result.code})`);
  } else {
    log(`⚠️  실패 — ${result.file}: ${result.reason}`);
  }
}

log(`감시 시작: ${WATCH_DIR}`);
const watcher = chokidar.watch(WATCH_DIR, {
  ignoreInitial: false, // 시작할 때 이미 있는 파일들도 한 번씩 훑어서 올림
  awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 }, // 파일 쓰는 도중에 읽지 않도록 — 쓰기가 멈추고 800ms 안정되면 처리
});

watcher
  .on("add", (filePath) => handleFile(filePath))
  .on("change", (filePath) => handleFile(filePath))
  .on("error", (err) => log(`❌ 감시 오류: ${err instanceof Error ? err.message : String(err)}`))
  .on("ready", () => {
    log("초기 스캔 완료 — 이제부터 새 파일/수정을 실시간으로 반영합니다. (Ctrl+C로 종료)");
    // 초기 스캔(위 add 이벤트들)으로 오늘 새로 들어온 분석 결과가 이미
    // CompanyAnalysis에 반영된 뒤에 today_picks.json을 만들어야 "이미 분석
    // 끝난 종목 제외" 필터가 방금 끝난 것까지 정확히 반영한다.
    refreshTodayPicks();
    setInterval(refreshTodayPicks, TODAY_PICKS_REFRESH_MS);
  });
