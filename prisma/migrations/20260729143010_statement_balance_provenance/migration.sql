-- AlterTable
ALTER TABLE "Statement" ADD COLUMN     "closingBalanceInferred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openingBalanceInferred" BOOLEAN NOT NULL DEFAULT false;
