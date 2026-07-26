import { prisma } from "@/lib/db/client";

/**
 * Truncate every domain table for a clean test state.
 *
 * WARNING: this wipes the database pointed to by DATABASE_URL. Point tests at a
 * disposable database (a dedicated Postgres in CI, or a local test DB).
 */
export async function resetDb() {
  const tables = [
    "Notification",
    "Alert",
    "Reconciliation",
    "Rule",
    "TransactionEvent",
    "Note",
    "Attachment",
    "Transaction",
    "Category",
    "ImportJob",
    "Statement",
    "StatementTemplate",
    "BankAccount",
    "Membership",
    "Organization",
    "User",
  ];
  const list = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`,
  );
}

/** Create a throwaway organization for a test. */
export async function createTestOrg(slug = `org-${crypto.randomUUID()}`) {
  return prisma.organization.create({
    data: { name: `Test ${slug}`, slug },
  });
}
