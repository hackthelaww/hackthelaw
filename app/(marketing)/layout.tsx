import Link from "next/link";
import { MarketingHeader } from "@/components/quinn/marketing-header";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <MarketingHeader />

      <div className="flex-1">{children}</div>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-10 py-12 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-base font-semibold tracking-tight text-foreground">Quinn</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Supervision layer for human–AI legal teams.
            </p>
          </div>
          <div className="flex gap-12">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Product
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link href="/matters" className="text-muted-foreground hover:text-foreground">
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-5xl px-10 pb-8 text-[11px] text-muted-foreground">
          Everything in this app is live — no fabricated data, no synthetic demos.
        </div>
      </footer>
    </div>
  );
}
