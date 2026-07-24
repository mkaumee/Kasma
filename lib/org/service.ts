import { Role } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { slugify } from "@/lib/org/slug";

/** Generate a slug unique across organizations, based on `name`. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let attempt = 2; attempt < 100; attempt++) {
    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${attempt}`;
  }
  // Extremely unlikely fallback.
  return `${base}-${Date.now()}`;
}

/** Create an organization and make `userId` its owner, atomically. */
export async function createOrganization(userId: string, name: string) {
  const slug = await uniqueSlug(name);
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name, slug } });
    await tx.membership.create({
      data: { organizationId: org.id, userId, role: Role.OWNER },
    });
    return org;
  });
}
