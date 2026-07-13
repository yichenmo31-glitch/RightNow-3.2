ALTER TABLE "UploadAsset"
ADD COLUMN "sha256" TEXT,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "byteSize" INTEGER,
ADD COLUMN "provider" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "promptVersion" TEXT;

CREATE INDEX "UploadAsset_userId_sha256_idx"
ON "UploadAsset"("userId", "sha256");
