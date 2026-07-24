import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { CreateOrgForm } from "@/components/org/create-org-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Create your organization" };

export default async function OnboardingPage() {
  const user = await requireUser();

  // If the user already belongs to an organization, skip onboarding.
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
  });
  if (membership) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create your organization</CardTitle>
            <CardDescription>
              Organizations keep each company&apos;s accounts and data separate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOrgForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
