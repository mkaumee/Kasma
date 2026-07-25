-- AlterTable
ALTER TABLE "Statement" ADD COLUMN     "statementTemplateId" TEXT;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_statementTemplateId_fkey" FOREIGN KEY ("statementTemplateId") REFERENCES "StatementTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
