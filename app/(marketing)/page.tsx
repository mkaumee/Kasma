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
    title: "Accounts",
    description: "All your company account balances on one screen.",
  },
  {
    icon: FileText,
    title: "Statements",
    description: "Upload a PDF, Excel, or CSV. Kasma pulls out the rows.",
  },
  {
    icon: ListChecks,
    title: "Transactions",
    description: "One ledger for every credit, debit, fee, and payment.",
  },
  {
    icon: ShieldCheck,
    title: "Evidence",
    description: "Attach receipts and notes. Every change is logged.",
  },
  {
    icon: BellRing,
    title: "Alerts",
    description: "Mismatches, missing transactions, and unusual activity.",
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Badge variant="secondary" className="mb-4">
          No bank API
        </Badge>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Every bank account in one ledger.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-pretty text-muted-foreground">
          Upload your bank statements. Kasma reads them, checks them against the
          statement&apos;s own running balance, and flags what doesn&apos;t add
          up.
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
            What it does
          </h2>
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
