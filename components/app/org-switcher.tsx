"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { switchOrganizationAction } from "@/lib/org/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SwitcherOrg = { id: string; name: string };

export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: SwitcherOrg[];
  activeOrgId: string;
}) {
  const active = orgs.find((o) => o.id === activeOrgId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-2">
          <span className="truncate font-medium">
            {active?.name ?? "Organization"}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {orgs.map((org) => (
          <form key={org.id} action={switchOrganizationAction}>
            <input type="hidden" name="organizationId" value={org.id} />
            <DropdownMenuItem asChild>
              <button
                type="submit"
                className="flex w-full items-center justify-between"
              >
                <span className="truncate">{org.name}</span>
                {org.id === activeOrgId && <Check className="size-4" />}
              </button>
            </DropdownMenuItem>
          </form>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus className="size-4" />
            Create organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
