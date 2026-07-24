import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/db/client";

export const ACTIVE_ORG_COOKIE = "kasma_active_org";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  };
});

/** Require a signed-in user, redirecting to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export type ActiveOrg = {
  organization: { id: string; name: string; slug: string };
  role: Role;
};

/**
 * Resolve the user's active organization: the one named by the active-org
 * cookie if the user is a member, otherwise their earliest membership.
 */
export async function getActiveOrg(userId: string): Promise<ActiveOrg | null> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const chosen =
    memberships.find((m) => m.organizationId === preferredId) ?? memberships[0];
  if (!chosen) return null;

  return {
    organization: {
      id: chosen.organization.id,
      name: chosen.organization.name,
      slug: chosen.organization.slug,
    },
    role: chosen.role,
  };
}

/** Require a user with an active organization, else redirect appropriately. */
export async function requireOrg(): Promise<ActiveOrg & { user: SessionUser }> {
  const user = await requireUser();
  const active = await getActiveOrg(user.id);
  if (!active) redirect("/onboarding");
  return { user, ...active };
}
