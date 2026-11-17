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
//
// DB 지문(2026-11-17): 빌드 로그에 DB 주소 대신 "호스트의 SHA-256 앞 8자리"만 찍는다. Preview와 운영 빌드
// 로그의 지문이 다르면 서로 다른 DB(Neon 브랜치)다. 주소·비밀번호는 출력하지 않는다.
// Preview 환경변수에 PRODUCTION_DB_FINGERPRINT(운영 빌드 로그의 지문)를 넣어 두면, Preview가 운영 DB를
// 가리킬 때 빌드를 실패시켜 배포 자체를 막는다.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const env = process.env.VERCEL_ENV ?? "";
const migrate = env === "production";
const dryRun = process.env.BUILD_DRY_RUN === "1";
const steps = [...(migrate ? [["prisma", "migrate", "deploy"]] : []), ["next", "build"]];

console.log(
  `[build] VERCEL_ENV=${env || "(없음·로컬)"} → ${migrate ? "운영 배포: DB 마이그레이션 실행 후 빌드" : "운영 배포가 아님: DB 마이그레이션 건너뜀, 빌드만"}`
);

// Neon은 같은 브랜치라도 연결 풀 주소에 "-pooler"가 붙는다 — 떼고 비교해 같은 DB면 같은 지문이 되게 한다.
function dbFingerprint(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace("-pooler", "");
    return createHash("sha256").update(host).digest("hex").slice(0, 8);
  } catch {
    return "invalid";
  }
}

const DB_VARS = ["POSTGRES_PRISMA_URL", "DATABASE_URL", "POSTGRES_URL_NON_POOLING"];
const prints = DB_VARS.map((k) => [k, dbFingerprint(process.env[k])]);
console.log(`[build] DB 지문(호스트 해시 앞 8자리): ${prints.map(([k, f]) => `${k}=${f ?? "없음"}`).join(", ")}`);
const prodPrint = process.env.PRODUCTION_DB_FINGERPRINT?.trim();
if (env === "preview" && prodPrint && prints.some(([, f]) => f === prodPrint)) {
  console.error("[build] 중단: Preview 빌드의 DB 지문이 운영 DB와 같습니다. Preview 환경변수를 Preview 전용 Neon 브랜치로 바꾸세요.");
  process.exit(1);
}

for (const args of steps) {
  console.log(`[build] npx ${args.join(" ")}${dryRun ? " (드라이런 — 실행 안 함)" : ""}`);
  if (dryRun) continue;
  const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`[build] 실패: npx ${args.join(" ")} (종료 코드 ${result.status ?? "없음"})`);
    process.exit(result.status ?? 1);
  }
}
