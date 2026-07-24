import Link from "next/link";
import {
  BellRing,
  FileText,
  Landmark,
  ListChecks,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    icon: Landmark,
    title: "Multi-bank management",
    description:
      "Monitor balances across every company bank account from a single dashboard.",
  },
  {
    icon: FileText,
    title: "Statement processing",
    description:
      "Upload PDF or Excel statements; transaction data is extracted automatically.",
  },
  {
    icon: ListChecks,
    title: "Transaction tracking",
    description:
      "Every credit, debit, charge, and payment in one centralized ledger.",
  },
  {
    icon: ShieldCheck,
    title: "Evidence & verification",
    description:
      "Attach receipts and notes with a complete, immutable transaction timeline.",
  },
  {
    icon: BellRing,
    title: "Financial control & alerts",
    description:
      "Detect mismatches, missing transactions, and unusual activity automatically.",
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Badge variant="secondary" className="mb-4">
          No bank API required
        </Badge>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Financial control across all your bank accounts.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-pretty text-muted-foreground">
          Kasma turns your bank statements into a live, verified view of company
          cash — balances, transactions, evidence, and alerts — without
          connecting to a single bank API.
        </p>
        <div id="get-started" className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/signup">Get started</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <section id="features" className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            Everything in one place
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Five pillars that keep company cash accurate and auditable.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="size-6 text-primary" />
                  <CardTitle className="mt-2">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
