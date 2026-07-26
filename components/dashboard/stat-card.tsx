import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** A single KPI tile: label, big value, optional icon and drill-down link. */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  href?: string;
  hint?: string;
  tone?: "default" | "warning" | "credit";
}) {
  const inner = (
    <Card className={cn(href && "transition-colors hover:bg-muted/40")}>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {Icon && <Icon className="size-4" aria-hidden />}
          {label}
        </CardDescription>
        <CardTitle
          className={cn(
            "text-2xl tabular-nums",
            tone === "warning" && "text-warning",
            tone === "credit" && "text-credit",
          )}
        >
          {value}
        </CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
