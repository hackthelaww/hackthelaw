import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Nothing in the graph matches that id. It may not have been ingested yet.
      </p>
      <Button size="sm" render={<Link href="/" />}>
        Back to control tower
      </Button>
    </main>
  );
}
