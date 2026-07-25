-- CreateTable
CREATE TABLE "StatementTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "signature" TEXT NOT NULL,
    "parserUsed" TEXT NOT NULL,
    "columnMap" JSONB,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatementTemplate_organizationId_idx" ON "StatementTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "StatementTemplate_bankAccountId_idx" ON "StatementTemplate"("bankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementTemplate_organizationId_signature_key" ON "StatementTemplate"("organizationId", "signature");

-- AddForeignKey
ALTER TABLE "StatementTemplate" ADD CONSTRAINT "StatementTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementTemplate" ADD CONSTRAINT "StatementTemplate_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
