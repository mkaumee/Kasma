import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
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
  // Must be signed in; this page also serves as "create another organization".
  await requireUser();

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
