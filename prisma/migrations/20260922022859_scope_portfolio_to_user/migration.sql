-- 둥지(PortfolioSettings/PortfolioHolding)를 사용자별로 분리 — 구글
-- 로그인 도입 후 첫 데이터 마이그레이션. userId를 일단 nullable로
-- 추가하고, 기존 데이터(로그인한 유일한 사용자 = 관리자 본인)를 그
-- User로 backfill한 다음에 NOT NULL로 잠근다. 새 컬럼을 곧장 NOT NULL로
-- 추가하면 기존 행이 있는 테이블에서 실패하기 때문(2행/1행 존재 확인함).

-- AddColumn (nullable)
ALTER TABLE "PortfolioSettings" ADD COLUMN "userId" TEXT;
ALTER TABLE "PortfolioHolding" ADD COLUMN "userId" TEXT;

-- Backfill: 이 시점에 로그인 이력이 있는 유일한 사용자(관리자 본인,
-- dnleogks9777@gmail.com)에게 기존 둥지 데이터를 전부 귀속시킨다.
UPDATE "PortfolioSettings" SET "userId" = (SELECT "id" FROM "User" WHERE "email" = 'dnleogks9777@gmail.com');
UPDATE "PortfolioHolding" SET "userId" = (SELECT "id" FROM "User" WHERE "email" = 'dnleogks9777@gmail.com');

-- Lock down to NOT NULL now that every existing row has an owner
ALTER TABLE "PortfolioSettings" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PortfolioHolding" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSettings_userId_key" ON "PortfolioSettings"("userId");
CREATE INDEX "PortfolioHolding_userId_idx" ON "PortfolioHolding"("userId");

-- AddForeignKey
ALTER TABLE "PortfolioSettings" ADD CONSTRAINT "PortfolioSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioHolding" ADD CONSTRAINT "PortfolioHolding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
