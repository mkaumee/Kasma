import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/empty-state";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { organization, user } = await requireOrg();

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, organizationId: organization.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.notification.count({
      where: {
        userId: user.id,
        organizationId: organization.id,
        readAt: null,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {unread > 0 && <MarkAllReadButton />}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Statement updates and alerts will appear here."
        />
      ) : (
        <Card className="divide-y p-0">
          {notifications.map((n) => {
            const inner = (
              <div
                className={cn(
                  "flex items-start gap-3 px-6 py-3",
                  n.readAt == null && "bg-primary/5",
                )}
              >
                {n.readAt == null ? (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                ) : (
                  <span className="mt-1.5 size-2 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{n.title}</p>
                  {n.body && (
                    <p className="text-sm text-muted-foreground">{n.body}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {n.createdAt.toLocaleString()}
                  </p>
                </div>
              </div>
            );
            return n.href ? (
              <Link
                key={n.id}
                href={n.href}
                className="block transition-colors hover:bg-muted/40"
              >
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
