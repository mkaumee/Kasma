"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/guards";
import { tenantDb } from "@/lib/db/tenant";
import { isCurrencyCode, parseMoney } from "@/lib/money/currency";

export type AccountFormState = { error?: string; ok?: boolean } | undefined;

const accountSchema = z.object({
  bankName: z.string().trim().min(1, "Bank name is required.").max(120),
  accountName: z.string().trim().min(1, "Account name is required.").max(120),
  accountNumber: z.string().trim().max(40).optional(),
  currency: z.string().refine(isCurrencyCode, "Unsupported currency."),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT_CARD", "LOAN", "OTHER"]),
  openingBalance: z.string().trim().optional(),
});

function readForm(formData: FormData) {
  return {
    bankName: formData.get("bankName"),
    accountName: formData.get("accountName"),
    accountNumber: formData.get("accountNumber"),
    currency: formData.get("currency"),
    type: formData.get("type"),
    openingBalance: formData.get("openingBalance"),
  };
}

/** Keep only the last 4 digits of an entered account number. */
function toLast4(accountNumber: string | undefined): string | null {
  const digits = (accountNumber ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-4) : null;
}

export async function createBankAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const ctx = await requirePermission("accounts:write");

  const parsed = accountSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const data = parsed.data;

  const opening = parseMoney(data.openingBalance || "0", data.currency);
  if (opening === null) {
    return { error: "Enter a valid opening balance." };
  }

  await tenantDb(ctx.organization.id).bankAccount.create({
    bankName: data.bankName,
    accountName: data.accountName,
    last4: toLast4(data.accountNumber),
    currency: data.currency,
    type: data.type,
    openingBalance: opening,
  });

  revalidatePath("/accounts");
  return { ok: true };
}

const updateSchema = accountSchema.extend({ id: z.string().min(1) });

export async function updateBankAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const ctx = await requirePermission("accounts:write");

  const parsed = updateSchema.safeParse({
    ...readForm(formData),
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const data = parsed.data;

  const opening = parseMoney(data.openingBalance || "0", data.currency);
  if (opening === null) {
    return { error: "Enter a valid opening balance." };
  }

  const result = await tenantDb(ctx.organization.id).bankAccount.update(
    data.id,
    {
      bankName: data.bankName,
      accountName: data.accountName,
      last4: toLast4(data.accountNumber),
      currency: data.currency,
      type: data.type,
      openingBalance: opening,
    },
  );
  if (result.count === 0) {
    return { error: "Account not found." };
  }

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${data.id}`);
  return { ok: true };
}

export async function deleteBankAccountAction(formData: FormData) {
  const ctx = await requirePermission("accounts:write");
  const id = String(formData.get("id") ?? "");
  if (id) {
    await tenantDb(ctx.organization.id).bankAccount.delete(id);
    revalidatePath("/accounts");
  }
  redirect("/accounts");
}
