CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChatMessage" ADD COLUMN "conversationId" TEXT;

CREATE INDEX "ChatConversation_userId_updatedAt_idx"
    ON "ChatConversation"("userId", "updatedAt");

CREATE INDEX "ChatMessage_userId_conversationId_createdAt_idx"
    ON "ChatMessage"("userId", "conversationId", "createdAt");

ALTER TABLE "ChatConversation"
    ADD CONSTRAINT "ChatConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
