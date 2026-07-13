ALTER TABLE "EvolutionImageProfile"
ADD COLUMN "activeBatchId" TEXT,
ADD COLUMN "selectedBatchId" TEXT;

ALTER TABLE "ImageGenTask"
ADD COLUMN "batchId" TEXT;

CREATE INDEX "ImageGenTask_userId_batchId_createdAt_idx"
ON "ImageGenTask"("userId", "batchId", "createdAt");

UPDATE "EvolutionImageProfile"
SET "activeBatchId" = "selectedIdealTaskId",
    "selectedBatchId" = "selectedIdealTaskId"
WHERE "selectedIdealTaskId" IS NOT NULL;

UPDATE "ImageGenTask" AS task
SET "batchId" = profile."activeBatchId"
FROM "EvolutionImageProfile" AS profile
WHERE task."id" = profile."selectedIdealTaskId";
