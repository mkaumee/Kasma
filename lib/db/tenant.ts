import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";

/**
 * Throw if a fetched record does not belong to the expected organization.
 * Use after a raw by-id lookup that couldn't be org-scoped at query time.
 */
export function assertSameOrg(
  organizationId: string,
  record: { organizationId: string } | null | undefined,
): void {
  if (!record || record.organizationId !== organizationId) {
    throw new Error("Cross-tenant access denied");
  }
}

/**
 * A Prisma facade scoped to a single organization. Every filterable read is
 * constrained to `organizationId` and every create injects it, so callers
 * cannot accidentally read or write another tenant's data. For a record by id,
 * use `findFirst({ where: { id } })` (not the global findUnique) so the org
 * scope still applies.
 *
 * Models are added here as features need them.
 */
export function tenantDb(organizationId: string) {
  return {
    organizationId,

    bankAccount: {
      findMany: (
        args: Omit<Prisma.BankAccountFindManyArgs, "where"> & {
          where?: Prisma.BankAccountWhereInput;
        } = {},
      ) =>
        prisma.bankAccount.findMany({
          ...args,
          where: { ...args.where, organizationId },
        }),
      findFirst: (
        args: Omit<Prisma.BankAccountFindFirstArgs, "where"> & {
          where?: Prisma.BankAccountWhereInput;
        } = {},
      ) =>
        prisma.bankAccount.findFirst({
          ...args,
          where: { ...args.where, organizationId },
        }),
      count: (where?: Prisma.BankAccountWhereInput) =>
        prisma.bankAccount.count({ where: { ...where, organizationId } }),
      create: (
        data: Omit<Prisma.BankAccountUncheckedCreateInput, "organizationId">,
      ) => prisma.bankAccount.create({ data: { ...data, organizationId } }),
      update: (id: string, data: Prisma.BankAccountUpdateManyMutationInput) =>
        prisma.bankAccount.updateMany({
          where: { id, organizationId },
          data,
        }),
      delete: (id: string) =>
        prisma.bankAccount.deleteMany({ where: { id, organizationId } }),
    },

    statement: {
      findMany: (
        args: Omit<Prisma.StatementFindManyArgs, "where"> & {
          where?: Prisma.StatementWhereInput;
        } = {},
      ) =>
        prisma.statement.findMany({
          ...args,
          where: { ...args.where, organizationId },
        }),
      findFirst: (
        args: Omit<Prisma.StatementFindFirstArgs, "where"> & {
          where?: Prisma.StatementWhereInput;
        } = {},
      ) =>
        prisma.statement.findFirst({
          ...args,
          where: { ...args.where, organizationId },
        }),
      count: (where?: Prisma.StatementWhereInput) =>
        prisma.statement.count({ where: { ...where, organizationId } }),
      create: (
        data: Omit<Prisma.StatementUncheckedCreateInput, "organizationId">,
      ) => prisma.statement.create({ data: { ...data, organizationId } }),
    },

    transaction: {
      findMany: (
        args: Omit<Prisma.TransactionFindManyArgs, "where"> & {
          where?: Prisma.TransactionWhereInput;
        } = {},
      ) =>
        prisma.transaction.findMany({
          ...args,
          where: { ...args.where, organizationId },
        }),
      findFirst: (
        args: Omit<Prisma.TransactionFindFirstArgs, "where"> & {
          where?: Prisma.TransactionWhereInput;
        } = {},
      ) =>
        prisma.transaction.findFirst({
          ...args,
          where: { ...args.where, organizationId },
        }),
      count: (where?: Prisma.TransactionWhereInput) =>
        prisma.transaction.count({ where: { ...where, organizationId } }),
      create: (
        data: Omit<Prisma.TransactionUncheckedCreateInput, "organizationId">,
      ) => prisma.transaction.create({ data: { ...data, organizationId } }),
    },

    category: {
      findMany: (
        args: Omit<Prisma.CategoryFindManyArgs, "where"> & {
          where?: Prisma.CategoryWhereInput;
        } = {},
      ) =>
        prisma.category.findMany({
          ...args,
          where: { ...args.where, organizationId },
        }),
      count: (where?: Prisma.CategoryWhereInput) =>
        prisma.category.count({ where: { ...where, organizationId } }),
      create: (
        data: Omit<Prisma.CategoryUncheckedCreateInput, "organizationId">,
      ) => prisma.category.create({ data: { ...data, organizationId } }),
    },

    alert: {
      findMany: (
        args: Omit<Prisma.AlertFindManyArgs, "where"> & {
          where?: Prisma.AlertWhereInput;
        } = {},
      ) =>
        prisma.alert.findMany({
          ...args,
          where: { ...args.where, organizationId },
        }),
      count: (where?: Prisma.AlertWhereInput) =>
        prisma.alert.count({ where: { ...where, organizationId } }),
    },
  };
}

export type TenantDb = ReturnType<typeof tenantDb>;
