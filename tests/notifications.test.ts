import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import {
  composeAlertDigest,
  notifyOrg,
  notifyUsers,
} from "@/lib/notifications/service";

import { createTestOrg, resetDb } from "./helpers/db";

describe("composeAlertDigest (pure)", () => {
  test("summarizes open alerts", () => {
    const d = composeAlertDigest("Acme", [
      { severity: "HIGH", type: "BALANCE_MISMATCH", title: "Off by $10" },
      { severity: "LOW", type: "ANOMALY", title: "Odd amount" },
    ]);
    expect(d.subject).toBe("Kasma: 2 open alerts for Acme");
    expect(d.text).toContain("HIGH · Off by $10");
    expect(d.html).toContain("<li>");
  });

  test("escapes HTML in titles", () => {
    const d = composeAlertDigest("A<b>", [
      { severity: "LOW", type: "ANOMALY", title: "x < y & z" },
    ]);
    expect(d.html).toContain("x &lt; y &amp; z");
    expect(d.html).not.toContain("<b>");
  });
});

describe("notifications (DB)", () => {
  let orgId: string;
  let ownerId: string;
  let viewerId: string;

  beforeAll(async () => {
    await resetDb();
    const org = await createTestOrg(`notif-${crypto.randomUUID()}`);
    orgId = org.id;
    const owner = await prisma.user.create({
      data: { email: `owner-${crypto.randomUUID()}@t.dev`, name: "Owner" },
    });
    const viewer = await prisma.user.create({
      data: { email: `viewer-${crypto.randomUUID()}@t.dev`, name: "Viewer" },
    });
    ownerId = owner.id;
    viewerId = viewer.id;
    await prisma.membership.createMany({
      data: [
        { organizationId: orgId, userId: ownerId, role: "OWNER" },
        { organizationId: orgId, userId: viewerId, role: "VIEWER" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("notifyUsers creates in-app rows", async () => {
    const n = await notifyUsers(orgId, [ownerId], {
      type: "TEST",
      title: "Hello",
      href: "/x",
    });
    expect(n).toBe(1);
    const row = await prisma.notification.findFirst({
      where: { organizationId: orgId, userId: ownerId },
    });
    expect(row!.title).toBe("Hello");
    expect(row!.readAt).toBeNull();
  });

  test("notifyOrg with minRole only reaches qualifying members", async () => {
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await notifyOrg(
      orgId,
      { type: "STATEMENT_PARSED", title: "Parsed" },
      { minRole: "ACCOUNTANT" },
    );
    // Owner qualifies (rank ≥ accountant); viewer does not.
    const owner = await prisma.notification.count({
      where: { organizationId: orgId, userId: ownerId },
    });
    const viewer = await prisma.notification.count({
      where: { organizationId: orgId, userId: viewerId },
    });
    expect(owner).toBe(1);
    expect(viewer).toBe(0);
  });
});
