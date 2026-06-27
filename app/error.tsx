"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-center justify-center p-8">
      <Card className="w-full border-destructive">
        <CardHeader>
          <CardTitle className="text-base">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-destructive">{error.message}</p>
          <p className="text-sm text-muted-foreground">
            Quinn never falls back to fabricated data on failure — this is the real error. Try again.
          </p>
          <div className="flex gap-2">
            <Button onClick={reset} size="sm">
              Try again
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/matters" />}>
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
