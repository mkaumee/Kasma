"use client";

import { useActionState } from "react";

import { inviteMemberAction } from "@/lib/org/invitation-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function InviteMemberForm() {
  const [state, action, pending] = useActionState(
    inviteMemberAction,
    undefined,
  );

  return (
    <form
      action={action}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          placeholder="teammate@company.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="ACCOUNTANT"
          className={selectClass}
        >
          <option value="ADMIN">Admin</option>
          <option value="ACCOUNTANT">Accountant</option>
          <option value="VIEWER">Viewer</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
      {(state?.error || state?.success) && (
        <p
          className={`w-full text-sm sm:w-auto ${state.error ? "text-destructive" : "text-muted-foreground"}`}
          role="alert"
        >
          {state.error ?? state.success}
        </p>
      )}
    </form>
  );
}
