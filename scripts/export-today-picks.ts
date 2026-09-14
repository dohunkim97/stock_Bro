// 수동 실행용: npm run export-today-picks
// (watch-company-analysis.ts가 이미 이 로직을 주기적으로 자동 실행하니
// 평소엔 안 돌려도 되고, 당장 최신 상태로 한 번 더 확실히 해두고 싶을 때
// 쓰는 용도)

import "dotenv/config";
import { exportTodayPicks } from "../lib/export-today-picks";

// tsx가 이 파일을 CJS로 컴파일해서(package.json에 "type":"module" 없음)
// 최상위 await은 못 쓴다 — watch-company-analysis.ts도 같은 이유로
// 이벤트 콜백 안에서만 await을 쓴다.
async function main() {
  const result = await exportTodayPicks();
  console.log(`오늘의 우선순위 목록 ${result.changed ? "갱신" : "변동 없음"} — ${result.codes.length}개`);
  console.log(result.codes.join(", ") || "(빈 목록 — 예측 없거나 전부 이미 분석됨)");
  console.log(`파일: ${result.path}`);
}

main().then(() => process.exit(0));
