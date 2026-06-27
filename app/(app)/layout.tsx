import { AppSidebar } from "@/components/quinn/app-sidebar";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <AppSidebar />
      <div className="quinn-surface min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
