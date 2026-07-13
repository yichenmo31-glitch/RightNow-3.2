CREATE TABLE "EvolutionImageProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "identityAnchors" JSONB,
  "identityAnchorVersion" INTEGER NOT NULL DEFAULT 0,
  "startImageUrl" TEXT,
  "startBodyFat" DOUBLE PRECISION,
  "targetBodyFat" DOUBLE PRECISION,
  "selectedIdealTaskId" TEXT,
  "selectedIdealImageUrl" TEXT,
  "selectedIdealVariant" TEXT,
  "selectionIdempotencyKey" TEXT,
  "selectionPayloadDigest" TEXT,
  "promptVersion" TEXT NOT NULL DEFAULT 'ideal-v2',
  "strategyVersion" TEXT NOT NULL DEFAULT 'v2-selected-ideal',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvolutionImageProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvolutionImageProfile_userId_key" ON "EvolutionImageProfile"("userId");
ALTER TABLE "EvolutionImageProfile" ADD CONSTRAINT "EvolutionImageProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageGenTask" ADD COLUMN "provider" TEXT, ADD COLUMN "model" TEXT, ADD COLUMN "promptVersion" TEXT, ADD COLUMN "inputDigest" TEXT, ADD COLUMN "variant" TEXT;
