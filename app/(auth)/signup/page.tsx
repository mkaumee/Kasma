import type { Metadata } from "next";

import { SignupForm } from "@/components/auth/signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const callbackUrl = invite ? `/invite/${invite}` : undefined;
  const loginHref = invite ? `/login?invite=${invite}` : "/login";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>
          Start monitoring your company&apos;s bank accounts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm callbackUrl={callbackUrl} loginHref={loginHref} />
      </CardContent>
    </Card>
  );
}
