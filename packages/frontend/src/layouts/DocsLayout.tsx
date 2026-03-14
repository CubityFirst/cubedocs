import { Outlet } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { BookOpen, FileText, Settings, LogOut } from "lucide-react";

export function DocsLayout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-border">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 px-4">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">CubeDocs</span>
        </div>

        <Separator />

        {/* Nav */}
        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="flex flex-col gap-1">
            <SidebarLink icon={<FileText className="h-4 w-4" />} label="Getting Started" />
            <SidebarLink icon={<FileText className="h-4 w-4" />} label="Installation" />
            <SidebarLink icon={<FileText className="h-4 w-4" />} label="Configuration" />
          </nav>
        </ScrollArea>

        <Separator />

        {/* Footer */}
        <div className="flex flex-col gap-1 p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b border-border px-6">
          <h1 className="text-sm font-medium text-muted-foreground">Documentation</h1>
        </header>
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <Outlet />
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function SidebarLink({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
      {icon}
      {label}
    </Button>
  );
}
