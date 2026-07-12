CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DELETION_PENDING');

CREATE TYPE "AccountDeletionStatus" AS ENUM (
    'REQUESTED',
    'EXTERNAL_CLEANUP',
    'EXTERNAL_QUARANTINED',
    'DB_PURGE',
    'FINALIZING',
    'COMPLETED',
    'FAILED_RETRYABLE'
);

ALTER TABLE "User"
    ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
    ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AccountDeletionJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "externalOperationId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalCompletedAt" TIMESTAMP(3),
    "dbPurgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionJob_userId_key" ON "AccountDeletionJob"("userId");
CREATE UNIQUE INDEX "AccountDeletionJob_idempotencyKey_key" ON "AccountDeletionJob"("idempotencyKey");
CREATE UNIQUE INDEX "AccountDeletionJob_externalOperationId_key" ON "AccountDeletionJob"("externalOperationId");
CREATE INDEX "AccountDeletionJob_status_updatedAt_idx" ON "AccountDeletionJob"("status", "updatedAt");
