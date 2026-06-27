"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StatusDot } from "@/components/quinn/status-dot";
import type { MatterOverview } from "@/lib/graph/queries";

export function SidebarMatterList({ matters }: { matters: MatterOverview[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {matters.map((m) => {
        const href = `/matters/${m.id}`;
        const active = pathname === href;
        const needsAttention = m.needsJudgementCount > 0;
        return (
          <Link
            key={m.id}
            href={href}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent ${
              active ? "bg-sidebar-accent font-medium text-sidebar-foreground" : "text-sidebar-foreground/80"
            }`}
          >
            <StatusDot tone={needsAttention ? "urgent" : "outline"} />
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
