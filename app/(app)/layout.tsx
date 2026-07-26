import { Landmark } from "lucide-react";

import { roleLabel } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { MobileNav, SidebarNav } from "@/components/app/sidebar-nav";
import { UserMenu } from "@/components/app/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organization, user, role } = await requireOrg();

  const [memberships, notifications, unread] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: user.id },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.notification.findMany({
      where: { userId: user.id, organizationId: organization.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.notification.count({
      where: {
        userId: user.id,
        organizationId: organization.id,
        readAt: null,
      },
    }),
  ]);
  const orgs = memberships.map((m) => m.organization);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <Landmark className="size-5 text-primary" />
          <span className="font-semibold">Kasma</span>
        </div>
        <div className="border-b p-2">
          <OrgSwitcher orgs={orgs} activeOrgId={organization.id} />
        </div>
        <SidebarNav />
        <div className="truncate border-t p-3 text-xs text-muted-foreground">
          {roleLabel(role)} · {organization.name}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b px-4 sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Landmark className="size-5 text-primary" />
            <span className="font-semibold">Kasma</span>
          </div>
          <div className="flex-1" />
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {roleLabel(role)}
          </Badge>
          <NotificationBell
            unread={unread}
            items={notifications.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              href: n.href,
              read: n.readAt != null,
              createdAt: n.createdAt.toISOString(),
            }))}
          />
          <ThemeToggle />
          <UserMenu name={user.name} email={user.email} />
        </header>
        <MobileNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
