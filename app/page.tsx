import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Quinn</h1>
      <p className="max-w-md text-muted-foreground">
        Supervision layer for human–AI legal teams. The control tower lands here in Phase 4.
      </p>
      <Link href="/health" className="text-sm font-medium underline underline-offset-4">
        Check system health
      </Link>
    </main>
  );
}
