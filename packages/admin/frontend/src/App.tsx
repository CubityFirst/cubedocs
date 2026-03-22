import { Routes, Route, Link, useLocation } from "react-router-dom";
import { UsersPage } from "./pages/UsersPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

export function App() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4" />
          CubeDocs Admin
        </div>
        <nav className="flex gap-1">
          <Button
            variant={location.pathname === "/" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link to="/">Users</Link>
          </Button>
          <Button
            variant={location.pathname === "/projects" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link to="/projects">Projects</Link>
          </Button>
        </nav>
      </header>

      <main className="px-6 py-8 max-w-6xl mx-auto">
        <Routes>
          <Route path="/" element={<UsersPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
        </Routes>
      </main>
    </div>
  );
}
