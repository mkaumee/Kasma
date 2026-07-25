import type { Metadata } from "next";

import { can, roleLabel } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { revokeInvitationAction } from "@/lib/org/invitation-actions";
import { listPendingInvitations } from "@/lib/org/invitations";
import { CopyField } from "@/components/org/copy-field";
import { InviteMemberForm } from "@/components/org/invite-member-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const { organization, role } = await requireOrg();
  const manage = can(role, "members:manage");

  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: organization.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    manage ? listPendingInvitations(organization.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      {manage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invite a teammate</CardTitle>
            <CardDescription>
              They&apos;ll join {organization.name} with the role you choose.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-medium">{m.user.name ?? m.user.email}</p>
                <p className="text-sm text-muted-foreground">{m.user.email}</p>
              </div>
              <Badge variant="secondary">{roleLabel(m.role)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {manage && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending invitations</CardTitle>
            <CardDescription>
              Share the link with each invitee (email delivery comes later).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invitations.map((invite) => (
              <div key={invite.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {roleLabel(invite.role)} · expires{" "}
                      {invite.expiresAt.toLocaleDateString()}
                    </p>
                  </div>
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="id" value={invite.id} />
                    <Button variant="ghost" size="sm" type="submit">
                      Revoke
                    </Button>
                  </form>
                </div>
                <CopyField
                  value={`${env.NEXT_PUBLIC_APP_URL}/invite/${invite.token}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
