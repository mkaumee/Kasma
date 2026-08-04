import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, Pencil, Plus } from "lucide-react";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { listAccountsWithBalances } from "@/lib/bank/accounts";
import { formatMoney, minorToDecimalString } from "@/lib/money/currency";
import { totalInBaseCurrency } from "@/lib/money/fx";
import { EmptyState } from "@/components/app/empty-state";
import { AccountDialog } from "@/components/bank/account-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const { organization, role } = await requireOrg();
  const canWrite = can(role, "accounts:write");
  const accounts = await listAccountsWithBalances(organization.id);
  const { total, hasUnconvertible } = totalInBaseCurrency(
    accounts,
    organization.baseCurrency,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        {canWrite && (
          <AccountDialog
            mode="create"
            trigger={
              <Button>
                <Plus /> Add account
              </Button>
            }
          />
        )}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No bank accounts yet"
          description="Add a bank account to start tracking its balance."
          action={
            canWrite ? (
              <AccountDialog
                mode="create"
                trigger={
                  <Button>
                    <Plus /> Add account
                  </Button>
                }
              />
            ) : undefined
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardDescription>
                Total across {accounts.length} account
                {accounts.length === 1 ? "" : "s"} · {organization.baseCurrency}
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {formatMoney(total, organization.baseCurrency)}
              </CardTitle>
            </CardHeader>
            {hasUnconvertible && (
              <CardContent className="text-xs text-muted-foreground">
                Some balances are in unsupported currencies and are excluded
                from this total.
              </CardContent>
            )}
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <Card key={account.id}>
                <CardHeader>
                  <CardDescription>
                    {account.bankName}
                    {account.last4 ? ` ···· ${account.last4}` : ""}
                  </CardDescription>
                  <CardTitle className="text-xl">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="hover:underline"
                    >
                      {account.accountName}
                    </Link>
                  </CardTitle>
                  {canWrite && (
                    <CardAction>
                      <AccountDialog
                        mode="edit"
                        account={{
                          id: account.id,
                          bankName: account.bankName,
                          accountName: account.accountName,
                          last4: account.last4,
                          currency: account.currency,
                          type: account.type,
                          openingBalance: minorToDecimalString(
                            account.openingBalance,
                            account.currency,
                          ),
                        }}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Edit">
                            <Pencil />
                          </Button>
                        }
                      />
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums">
                    {formatMoney(account.currentBalance, account.currency)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {account.currency} · current balance
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
