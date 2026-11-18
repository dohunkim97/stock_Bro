// 환경별 DB 주소 규칙(Preview는 Preview 전용 DB만, 운영으로 넘어가지 않음). 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeDbUrl, migrationDbUrl } from "@/lib/db-url";

const PROD = {
  POSTGRES_PRISMA_URL: "postgresql://u:p@ep-prod-1-pooler.example.neon.tech/db",
  DATABASE_URL: "postgresql://u:p@ep-prod-1-pooler.example.neon.tech/db",
  POSTGRES_URL_NON_POOLING: "postgresql://u:p@ep-prod-1.example.neon.tech/db",
};
const PREVIEW = {
  PREVIEW_POSTGRES_PRISMA_URL: "postgresql://u:p@ep-prev-2-pooler.example.neon.tech/db",
  PREVIEW_POSTGRES_URL_NON_POOLING: "postgresql://u:p@ep-prev-2.example.neon.tech/db",
};

test("운영·로컬은 예전과 같다(POSTGRES_PRISMA_URL → DATABASE_URL, 마이그레이션은 NON_POOLING)", () => {
  for (const VERCEL_ENV of ["production", "development", undefined]) {
    const env = { ...PROD, ...PREVIEW, VERCEL_ENV };
    assert.equal(runtimeDbUrl(env), PROD.POSTGRES_PRISMA_URL);
    assert.equal(migrationDbUrl(env), PROD.POSTGRES_URL_NON_POOLING);
  }
  assert.equal(runtimeDbUrl({ DATABASE_URL: "x" }), "x");
});

test("Preview는 Preview 전용 변수만 쓴다(통합 변수가 운영 주소여도)", () => {
  const env = { ...PROD, ...PREVIEW, VERCEL_ENV: "preview" };
  assert.equal(runtimeDbUrl(env), PREVIEW.PREVIEW_POSTGRES_PRISMA_URL);
  assert.equal(migrationDbUrl(env), PREVIEW.PREVIEW_POSTGRES_URL_NON_POOLING);
});

test("Preview인데 전용 변수가 없으면 운영 주소로 넘어가지 않는다", () => {
  for (const missing of [{}, { PREVIEW_POSTGRES_PRISMA_URL: "  " }]) {
    const env = { ...PROD, VERCEL_ENV: "preview", ...missing };
    assert.throws(() => runtimeDbUrl(env), /PREVIEW_POSTGRES_PRISMA_URL/);
    assert.equal(migrationDbUrl(env), undefined);
  }
});
