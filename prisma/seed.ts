import {
  AccountType,
  PrismaClient,
  Role,
  TxnDirection,
  TxnType,
} from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123!";

/** Demo dataset for local development. Idempotent — safe to run repeatedly. */
async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: {},
    create: { name: "Acme Inc", slug: "acme" },
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const owner = await prisma.user.upsert({
    where: { email: "owner@kasma.dev" },
    update: { passwordHash },
    create: { email: "owner@kasma.dev", name: "Ada Owner", passwordHash },
  });
  const accountant = await prisma.user.upsert({
    where: { email: "accountant@kasma.dev" },
    update: { passwordHash },
    create: {
      email: "accountant@kasma.dev",
      name: "Ben Accountant",
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: { userId: owner.id, organizationId: org.id },
    },
    update: { role: Role.OWNER },
    create: { userId: owner.id, organizationId: org.id, role: Role.OWNER },
  });
  await prisma.membership.upsert({
    where: {
      userId_organizationId: { userId: accountant.id, organizationId: org.id },
    },
    update: { role: Role.ACCOUNTANT },
    create: {
      userId: accountant.id,
      organizationId: org.id,
      role: Role.ACCOUNTANT,
    },
  });

  const categoryNames = [
    "Revenue",
    "Payroll",
    "Software",
    "Office",
    "Bank fees",
  ];
  for (const name of categoryNames) {
    await prisma.category.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
  }
  const revenue = await prisma.category.findFirstOrThrow({
    where: { organizationId: org.id, name: "Revenue" },
  });
  const software = await prisma.category.findFirstOrThrow({
    where: { organizationId: org.id, name: "Software" },
  });

  // Reset demo accounts + transactions for a clean, deterministic demo state.
  await prisma.transaction.deleteMany({ where: { organizationId: org.id } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: org.id } });

  const operating = await prisma.bankAccount.create({
    data: {
      organizationId: org.id,
      bankName: "Chase",
      accountName: "Operating",
      last4: "4821",
      currency: "USD",
      type: AccountType.CHECKING,
      openingBalance: 100_000_000n, // $1,000,000.00 in cents
    },
  });
  await prisma.bankAccount.create({
    data: {
      organizationId: org.id,
      bankName: "Chase",
      accountName: "Payroll",
      last4: "7702",
      currency: "USD",
      type: AccountType.CHECKING,
      openingBalance: 25_000_000n, // $250,000.00
    },
  });
  await prisma.bankAccount.create({
    data: {
      organizationId: org.id,
      bankName: "Mercury",
      accountName: "Reserve",
      last4: "1195",
      currency: "USD",
      type: AccountType.SAVINGS,
      openingBalance: 50_000_000n, // $500,000.00
    },
  });

  // A few transactions on Operating with correct running balances.
  const rows: {
    date: string;
    description: string;
    amount: bigint;
    type: TxnType;
    categoryId?: string;
  }[] = [
    {
      date: "2026-06-02",
      description: "Customer payment — Globex",
      amount: 4_500_00n,
      type: TxnType.CREDIT,
      categoryId: revenue.id,
    },
    {
      date: "2026-06-05",
      description: "AWS invoice",
      amount: -1_240_55n,
      type: TxnType.PAYMENT,
      categoryId: software.id,
    },
    {
      date: "2026-06-09",
      description: "Customer payment — Initech",
      amount: 12_000_00n,
      type: TxnType.CREDIT,
      categoryId: revenue.id,
    },
    {
      date: "2026-06-15",
      description: "Monthly account fee",
      amount: -35_00n,
      type: TxnType.FEE,
    },
  ];

  const closingBalance =
    operating.openingBalance + rows.reduce((sum, r) => sum + r.amount, 0n);

  // A confirmed statement the transactions belong to.
  const statement = await prisma.statement.create({
    data: {
      organizationId: org.id,
      bankAccountId: operating.id,
      currency: "USD",
      status: "CONFIRMED",
      source: "UPLOAD",
      originalFilename: "chase-operating-2026-06.pdf",
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      openingBalance: operating.openingBalance,
      closingBalance,
      parserUsed: "pdf",
      confidence: 0.98,
    },
  });

  let balance = operating.openingBalance;
  let index = 0;
  for (const row of rows) {
    balance += row.amount;
    await prisma.transaction.create({
      data: {
        organizationId: org.id,
        bankAccountId: operating.id,
        statementId: statement.id,
        date: new Date(row.date),
        description: row.description,
        amount: row.amount,
        direction: row.amount >= 0n ? TxnDirection.CREDIT : TxnDirection.DEBIT,
        type: row.type,
        runningBalance: balance,
        currency: "USD",
        categoryId: row.categoryId,
        dedupeHash: `seed:${operating.id}:${index}`,
      },
    });
    index += 1;
  }

  // A demo alert so the Alerts center + dashboard widgets aren't empty.
  await prisma.alert.upsert({
    where: {
      organizationId_dedupeKey: {
        organizationId: org.id,
        dedupeKey: "demo:unusual:aws",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      type: "UNUSUAL_ACTIVITY",
      severity: "MEDIUM",
      status: "OPEN",
      title: "Large round amount",
      detail: { amount: "-124055", currency: "USD", reason: "round-sum" },
      dedupeKey: "demo:unusual:aws",
      bankAccountId: operating.id,
    },
  });

  console.log(
    `Seeded org "${org.name}" (${categoryNames.length} categories, 3 accounts, ${rows.length} transactions, 1 statement, 1 alert).`,
  );
  console.log(
    `Demo login: owner@kasma.dev / ${DEMO_PASSWORD} (also accountant@kasma.dev).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
