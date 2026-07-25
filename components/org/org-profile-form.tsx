"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { updateOrganizationNameAction } from "@/lib/org/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrgProfileForm({
  defaultName,
  slug,
}: {
  defaultName: string;
  slug: string;
}) {
  const [state, action, pending] = useActionState(
    updateOrganizationNameAction,
    undefined,
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="org-name">Name</Label>
        <Input id="org-name" name="name" defaultValue={defaultName} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-slug">Identifier</Label>
        <Input
          id="org-slug"
          value={slug}
          readOnly
          disabled
          className="font-mono text-xs"
        />
      </div>
      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
