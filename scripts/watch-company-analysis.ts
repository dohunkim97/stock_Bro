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

const WATCH_DIR = "C:\\Users\\PC\\Desktop\\바이브 코딩\\다트 데이터\\기업분석 데이터";

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
  .on("ready", () => log("초기 스캔 완료 — 이제부터 새 파일/수정을 실시간으로 반영합니다. (Ctrl+C로 종료)"));
