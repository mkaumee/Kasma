-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('RECEIPT', 'INVOICE', 'DOCUMENT', 'NOTE');

-- CreateEnum
CREATE TYPE "TransactionEventKind" AS ENUM ('CREATED', 'EDITED', 'CATEGORIZED', 'EVIDENCE_ADDED', 'VERIFIED', 'MATCHED', 'NOTE');

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transactionId" TEXT,
    "statementId" TEXT,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'DOCUMENT',
    "fileKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "contentType" TEXT,
    "size" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" "TransactionEventKind" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_organizationId_idx" ON "Attachment"("organizationId");

-- CreateIndex
CREATE INDEX "Attachment_transactionId_idx" ON "Attachment"("transactionId");

-- CreateIndex
CREATE INDEX "Attachment_statementId_idx" ON "Attachment"("statementId");

-- CreateIndex
CREATE INDEX "Note_organizationId_idx" ON "Note"("organizationId");

-- CreateIndex
CREATE INDEX "Note_transactionId_idx" ON "Note"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionEvent_organizationId_idx" ON "TransactionEvent"("organizationId");

-- CreateIndex
CREATE INDEX "TransactionEvent_transactionId_idx" ON "TransactionEvent"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionEvent_createdAt_idx" ON "TransactionEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionEvent" ADD CONSTRAINT "TransactionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionEvent" ADD CONSTRAINT "TransactionEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionEvent" ADD CONSTRAINT "TransactionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
