-- Table was cleared first (old week-keyed rows aren't valid dates and don't
-- fit the new daily model), so this is a straightforward column swap.
ALTER TABLE "WeeklyPrediction" DROP COLUMN "forWeekKey";
ALTER TABLE "WeeklyPrediction" ADD COLUMN "forDate" TEXT NOT NULL;
CREATE UNIQUE INDEX "WeeklyPrediction_forDate_key" ON "WeeklyPrediction"("forDate");
