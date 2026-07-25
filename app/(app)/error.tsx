"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" />
      </div>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. You can try again, or head back to the
        dashboard.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/dashboard">Go to dashboard</a>
        </Button>
      </div>
    </div>
  );
}
