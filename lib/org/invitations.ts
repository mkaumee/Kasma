import crypto from "node:crypto";

import { InvitationStatus, type Role } from "@prisma/client";

import { prisma } from "@/lib/db/client";

const INVITE_TTL_DAYS = 7;

export function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** Create (or refresh) a pending invitation for an email into an org. */
export async function createInvitation(params: {
  organizationId: string;
  email: string;
  role: Role;
  invitedById: string;
}) {
  const email = params.email.toLowerCase();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  return prisma.invitation.upsert({
    where: {
      organizationId_email: {
        organizationId: params.organizationId,
        email,
      },
    },
    update: {
      role: params.role,
      token,
      status: InvitationStatus.PENDING,
      expiresAt,
      invitedById: params.invitedById,
      acceptedAt: null,
    },
    create: {
      organizationId: params.organizationId,
      email,
      role: params.role,
      token,
      expiresAt,
      invitedById: params.invitedById,
    },
  });
}

export async function listPendingInvitations(organizationId: string) {
  return prisma.invitation.findMany({
    where: { organizationId, status: InvitationStatus.PENDING },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeInvitation(organizationId: string, id: string) {
  await prisma.invitation.updateMany({
    where: { id, organizationId, status: InvitationStatus.PENDING },
    data: { status: InvitationStatus.REVOKED },
  });
}

export function getInvitationByToken(token: string) {
  return prisma.invitation.findUnique({
    where: { token },
    include: { organization: true },
  });
}

export type InviteAcceptResult =
  | { ok: true; organizationId: string }
  | { ok: false; reason: "invalid" | "expired" | "email_mismatch" };

/** Accept an invitation for a signed-in user, creating their membership. */
export async function acceptInvitation(
  token: string,
  user: { id: string; email: string },
): Promise<InviteAcceptResult> {
  const invite = await prisma.invitation.findUnique({ where: { token } });
  if (!invite || invite.status !== InvitationStatus.PENDING) {
    return { ok: false, reason: "invalid" };
  }
  if (invite.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, reason: "email_mismatch" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invite.organizationId,
        },
      },
      update: { role: invite.role },
      create: {
        userId: user.id,
        organizationId: invite.organizationId,
        role: invite.role,
      },
    });
    await tx.invitation.update({
      where: { id: invite.id },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
    });
  });

  return { ok: true, organizationId: invite.organizationId };
}
