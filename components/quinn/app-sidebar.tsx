import Link from "next/link";
import { listMattersOverview, type MatterOverview } from "@/lib/graph/queries";
import { getUserMatterSlugs } from "@/lib/supabase/cases";
import { SidebarMatterList } from "@/components/quinn/sidebar-matter-list";
import { SignOutButton } from "@/components/quinn/sign-out-button";
import { Search } from "lucide-react";

export async function AppSidebar() {
  let matters: MatterOverview[] = [];
  let loadError: string | null = null;
  try {
    const slugs = await getUserMatterSlugs();
    if (slugs !== null && slugs.length === 0) {
      matters = [];
    } else {
      matters = await listMattersOverview(slugs ?? undefined);
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const needsAttention = matters.reduce((sum, m) => sum + m.needsJudgementCount, 0);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar">
      {/* ── Brand ── */}
      <Link
        href="/matters"
        className="flex items-baseline gap-2 px-5 py-5 text-lg font-semibold tracking-tight text-sidebar-foreground"
      >
        Quinn
        <span className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground">
          Legal
        </span>
      </Link>

      {/* ── Search placeholder ── */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-2.5 py-1.5 text-sm text-muted-foreground">
          <Search className="size-3.5" />
          <span className="text-xs">Search matters...</span>
          <kbd className="ml-auto rounded border border-sidebar-border px-1 py-px font-mono text-[10px] text-muted-foreground/60">
            /
          </kbd>
        </div>
      </div>

      {/* ── Matters ── */}
      <div className="flex-1 overflow-y-auto px-3">
        <div className="flex items-baseline justify-between px-2 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Matters
          </span>
          {needsAttention > 0 && (
            <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-semibold tabular-nums text-background">
              {needsAttention}
            </span>
          )}
        </div>
        {loadError ? (
          <p className="px-2 py-1 text-xs text-destructive">{loadError}</p>
        ) : matters.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No matters yet</p>
        ) : (
          <SidebarMatterList matters={matters} />
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t px-3 py-2 space-y-0.5">
        <Link
          href="/backend"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          Backend demo
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}
