// 환경별 DB 주소 고르기(2026-11-18).
//
// Vercel의 Neon 통합 변수(POSTGRES_PRISMA_URL·DATABASE_URL·POSTGRES_URL_NON_POOLING)는 "All Environments"로
// 걸려 있고 직접 고칠 수 없어서, Preview 배포도 운영 DB를 가리킨다. 그래서 Preview에서는 따로 넣은
// Preview 전용 변수(PREVIEW_POSTGRES_PRISMA_URL·PREVIEW_POSTGRES_URL_NON_POOLING, Neon 'preview' 브랜치)만 쓰고,
// 그 변수가 없으면 운영 주소로 넘어가지 않고 멈춘다. 운영·로컬은 예전과 같다.
// 빌드 단계 검사(Preview 주소가 운영과 같으면 중단)는 scripts/vercel-build.mjs.

export type DbEnv = Record<string, string | undefined>;

export const PREVIEW_RUNTIME_VAR = "PREVIEW_POSTGRES_PRISMA_URL";
export const PREVIEW_MIGRATION_VAR = "PREVIEW_POSTGRES_URL_NON_POOLING";

function isPreview(env: DbEnv): boolean {
  return env.VERCEL_ENV === "preview";
}

/** 앱 실행용(연결 풀) 주소. Preview인데 전용 변수가 없으면 예외 — 운영 DB로 절대 넘어가지 않는다. */
export function runtimeDbUrl(env: DbEnv = process.env): string {
  if (isPreview(env)) {
    const url = env[PREVIEW_RUNTIME_VAR]?.trim();
    if (!url) throw new Error(`Preview 배포인데 ${PREVIEW_RUNTIME_VAR}가 없어 DB에 연결하지 않습니다(운영 DB 보호)`);
    return url;
  }
  return env.POSTGRES_PRISMA_URL ?? env.DATABASE_URL ?? "";
}

/** 마이그레이션용(직접 연결) 주소. Preview인데 전용 변수가 없으면 undefined — prisma 명령이 실패할 뿐 운영으로 가지 않는다. */
export function migrationDbUrl(env: DbEnv = process.env): string | undefined {
  if (isPreview(env)) return env[PREVIEW_MIGRATION_VAR]?.trim() || undefined;
  return env.POSTGRES_URL_NON_POOLING;
}
