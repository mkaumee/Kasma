import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Kasma</h1>
      <p className="mt-3 text-muted-foreground">
        Multi-bank financial control platform. Monitor balances, process bank
        statements, track every transaction, and catch financial errors — no
        bank API required.
      </p>

      <Card className="mt-8 max-w-sm">
        <CardHeader>
          <CardDescription>Total cash · 6 accounts</CardDescription>
          <CardTitle className="text-3xl tabular-nums">$1,284,930.22</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Badge variant="credit">
            <ArrowUpRight /> +4.2%
          </Badge>
          <span className="text-sm text-muted-foreground">
            vs. last statement
          </span>
        </CardContent>
      </Card>

      <div className="mt-8 flex gap-3">
        <Button>Get started</Button>
        <Button variant="outline">View demo</Button>
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        Setup in progress — Phase 0.
      </p>
    </main>
  );
}
