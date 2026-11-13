// 빌드 명령(npm run build). DB 마이그레이션은 운영 배포에서만 실행한다(2026-11-13).
//
// 왜: 예전 빌드 명령 `prisma migrate deploy && next build`는 Vercel 미리보기(Preview) 빌드에서도
// 돌았다. 이 프로젝트의 DB 환경변수는 Production·Preview·Development에 같은 값(운영 DB)으로
// 걸려 있어서, DB 변경이 들어간 브랜치를 push만 해도 리뷰·머지 전에 운영 DB 구조가 바뀔 수
// 있었다. 이제는:
//   - VERCEL_ENV=production(main 배포) → 마이그레이션 후 빌드(예전과 같음)
//   - VERCEL_ENV=preview / development / 로컬(값 없음) → 마이그레이션 건너뛰고 빌드만
// 로컬 개발 DB에 마이그레이션이 필요하면 `npx prisma migrate deploy`를 직접 실행한다.
// BUILD_DRY_RUN=1이면 실행하지 않고 계획만 출력한다(검증용).
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? "";
const migrate = env === "production";
const dryRun = process.env.BUILD_DRY_RUN === "1";
const steps = [...(migrate ? [["prisma", "migrate", "deploy"]] : []), ["next", "build"]];

console.log(
  `[build] VERCEL_ENV=${env || "(없음·로컬)"} → ${migrate ? "운영 배포: DB 마이그레이션 실행 후 빌드" : "운영 배포가 아님: DB 마이그레이션 건너뜀, 빌드만"}`
);

for (const args of steps) {
  console.log(`[build] npx ${args.join(" ")}${dryRun ? " (드라이런 — 실행 안 함)" : ""}`);
  if (dryRun) continue;
  const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`[build] 실패: npx ${args.join(" ")} (종료 코드 ${result.status ?? "없음"})`);
    process.exit(result.status ?? 1);
  }
}
