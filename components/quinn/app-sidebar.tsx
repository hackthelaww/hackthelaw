import Link from "next/link";
import { listMattersOverview, type MatterOverview } from "@/lib/graph/queries";
import { SidebarMatterList } from "@/components/quinn/sidebar-matter-list";
import { ChatPanel } from "@/components/quinn/chat-panel";

export async function AppSidebar() {
  let matters: MatterOverview[] = [];
  let loadError: string | null = null;
  try {
    matters = await listMattersOverview();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-sidebar">
      <Link href="/" className="px-4 py-4 text-base font-semibold tracking-tight text-sidebar-foreground">
        Quinn
      </Link>

      <div className="flex-1 overflow-y-auto px-2">
        <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Matters</p>
        {loadError ? (
          <p className="px-2 py-1 text-xs text-destructive">{loadError}</p>
        ) : matters.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No matters yet</p>
        ) : (
          <SidebarMatterList matters={matters} />
        )}
      </div>

      <div className="border-t px-2 py-2">
        <Link
          href="/backend"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
        >
          Backend demo
        </Link>
        <ChatPanel />
      </div>
    </aside>
  );
}
