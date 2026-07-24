import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import {
  acceptInvitation,
  createInvitation,
  getInvitationByToken,
} from "@/lib/org/invitations";
import { resetDb } from "./helpers/db";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const org = await prisma.organization.create({
    data: { name: "Org", slug: `o-${crypto.randomUUID()}` },
  });
  const inviter = await prisma.user.create({
    data: { email: `inviter-${crypto.randomUUID()}@example.dev` },
  });
  return { org, inviter };
}

describe("invitations", () => {
  test("accepting creates a membership with the invited role and marks it accepted", async () => {
    const { org, inviter } = await setup();
    // Invited email uses mixed case to verify case-insensitive matching.
    const invite = await createInvitation({
      organizationId: org.id,
      email: "New@Example.com",
      role: "ACCOUNTANT",
      invitedById: inviter.id,
    });
    const user = await prisma.user.create({
      data: { email: "new@example.com" },
    });

    const result = await acceptInvitation(invite.token, {
      id: user.id,
      email: user.email,
    });
    expect(result).toEqual({ ok: true, organizationId: org.id });

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: user.id, organizationId: org.id },
      },
    });
    expect(membership?.role).toBe("ACCOUNTANT");

    const refreshed = await getInvitationByToken(invite.token);
    expect(refreshed?.status).toBe("ACCEPTED");
  });

  test("rejects acceptance when the email does not match", async () => {
    const { org, inviter } = await setup();
    const invite = await createInvitation({
      organizationId: org.id,
      email: "invited@example.com",
      role: "VIEWER",
      invitedById: inviter.id,
    });
    const user = await prisma.user.create({
      data: { email: "someone-else@example.com" },
    });

    const result = await acceptInvitation(invite.token, {
      id: user.id,
      email: user.email,
    });
    expect(result).toEqual({ ok: false, reason: "email_mismatch" });
  });

  test("re-inviting the same email refreshes the token in place", async () => {
    const { org, inviter } = await setup();
    const first = await createInvitation({
      organizationId: org.id,
      email: "dup@example.com",
      role: "VIEWER",
      invitedById: inviter.id,
    });
    const second = await createInvitation({
      organizationId: org.id,
      email: "dup@example.com",
      role: "ADMIN",
      invitedById: inviter.id,
    });

    expect(second.id).toBe(first.id);
    expect(second.token).not.toBe(first.token);
    expect(second.role).toBe("ADMIN");
    const count = await prisma.invitation.count({
      where: { organizationId: org.id, email: "dup@example.com" },
    });
    expect(count).toBe(1);
  });
});
