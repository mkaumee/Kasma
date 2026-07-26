import type { Role } from "@prisma/client";

import { hasAtLeast } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/mailer";

/**
 * Notification service: writes durable in-app notifications and (optionally)
 * sends email. Email is best-effort and no-ops without a configured provider,
 * so notifications always land in-app.
 */

export type NotificationData = {
  type: string;
  title: string;
  body?: string;
  href?: string;
};

export async function notifyUsers(
  organizationId: string,
  userIds: string[],
  data: NotificationData,
): Promise<number> {
  if (userIds.length === 0) return 0;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      organizationId,
      userId,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      href: data.href ?? null,
    })),
  });
  return userIds.length;
}

export async function orgMembers(
  organizationId: string,
  minRole?: Role,
): Promise<{ id: string; email: string; name: string | null }[]> {
  const memberships = await prisma.membership.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return memberships
    .filter((m) => (minRole ? hasAtLeast(m.role, minRole) : true))
    .map((m) => m.user);
}

/**
 * Notify an org's members (optionally only those at/above `minRole`) in-app,
 * and email them when `email` is set and a provider is configured.
 */
export async function notifyOrg(
  organizationId: string,
  data: NotificationData,
  opts: { minRole?: Role; email?: boolean } = {},
): Promise<void> {
  const members = await orgMembers(organizationId, opts.minRole);
  if (members.length === 0) return;
  await notifyUsers(
    organizationId,
    members.map((m) => m.id),
    data,
  );
  if (opts.email) {
    await sendEmail({
      to: members.map((m) => m.email),
      subject: data.title,
      html: `<p>${escapeHtml(data.title)}</p>${
        data.body ? `<p>${escapeHtml(data.body)}</p>` : ""
      }`,
      text: `${data.title}${data.body ? `\n\n${data.body}` : ""}`,
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type DigestAlert = { severity: string; type: string; title: string };

/** Pure: compose an alert-digest email from a list of open alerts. */
export function composeAlertDigest(
  orgName: string,
  alerts: DigestAlert[],
): { subject: string; html: string; text: string } {
  const n = alerts.length;
  const subject = `Kasma: ${n} open alert${n === 1 ? "" : "s"} for ${orgName}`;
  const items = alerts
    .map((a) => `${a.severity} · ${a.title}`)
    .slice(0, 20);
  const html =
    `<p>${escapeHtml(orgName)} has ${n} open financial-control alert${
      n === 1 ? "" : "s"
    }:</p><ul>` +
    items.map((i) => `<li>${escapeHtml(i)}</li>`).join("") +
    `</ul>`;
  const text = `${orgName} has ${n} open alert(s):\n${items
    .map((i) => `- ${i}`)
    .join("\n")}`;
  return { subject, html, text };
}

/** Email an alert digest to the org's accountants+ (best-effort). */
export async function sendAlertDigest(organizationId: string): Promise<void> {
  const [org, alerts, recipients] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.alert.findMany({
      where: { organizationId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    orgMembers(organizationId, "ACCOUNTANT"),
  ]);
  if (!org || alerts.length === 0 || recipients.length === 0) return;

  const digest = composeAlertDigest(
    org.name,
    alerts.map((a) => ({ severity: a.severity, type: a.type, title: a.title })),
  );
  await sendEmail({
    to: recipients.map((r) => r.email),
    subject: digest.subject,
    html: digest.html,
    text: digest.text,
  });
}
