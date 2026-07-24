import Link from "next/link";
import { Landmark } from "lucide-react";

import { signOutAction } from "@/lib/auth/actions";
import { roleLabel } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organization, user, role } = await requireOrg();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <Landmark className="size-5 text-primary" />
            <span>Kasma</span>
            <span className="font-normal text-muted-foreground">
              / {organization.name}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {roleLabel(role)}
            </Badge>
            <ThemeToggle />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <form action={signOutAction}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
