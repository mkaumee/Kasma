import type { Metadata } from "next";
import Link from "next/link";

import { signOutAction } from "@/lib/auth/actions";
import { roleLabel } from "@/lib/auth/rbac";
import { getCurrentUser } from "@/lib/auth/session";
import { acceptInvitationAction } from "@/lib/org/invitation-actions";
import { getInvitationByToken } from "@/lib/org/invitations";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Accept invitation" };

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const invite = await getInvitationByToken(token);
  const invalid =
    !invite || invite.status !== "PENDING" || invite.expiresAt < new Date();

  if (invalid || !invite) {
    return (
      <Centered>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Invitation unavailable</CardTitle>
            <CardDescription>
              This invitation is invalid, revoked, or has expired.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="outline">
              <Link href="/">Back to home</Link>
            </Button>
          </CardFooter>
        </Card>
      </Centered>
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    return (
      <Centered>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              Join {invite.organization.name}
            </CardTitle>
            <CardDescription>
              You&apos;ve been invited as {roleLabel(invite.role)}. Sign in or
              create an account with {invite.email} to accept.
            </CardDescription>
          </CardHeader>
          <CardFooter className="gap-2">
            <Button asChild>
              <Link href={`/signup?invite=${token}`}>Create account</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/login?invite=${token}`}>Sign in</Link>
            </Button>
          </CardFooter>
        </Card>
      </Centered>
    );
  }

  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <Centered>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Wrong account</CardTitle>
            <CardDescription>
              This invitation is for {invite.email}, but you&apos;re signed in
              as {user.email}. Sign out and use the invited email.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <form action={signOutAction}>
              <Button variant="outline" type="submit">
                Sign out
              </Button>
            </form>
          </CardFooter>
        </Card>
      </Centered>
    );
  }

  return (
    <Centered>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Join {invite.organization.name}
          </CardTitle>
          <CardDescription>
            Accept to join as {roleLabel(invite.role)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 text-sm text-destructive" role="alert">
              We couldn&apos;t accept the invitation ({error}). It may have
              expired.
            </p>
          )}
          <form action={acceptInvitationAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" className="w-full">
              Accept invitation
            </Button>
          </form>
        </CardContent>
      </Card>
    </Centered>
  );
}
