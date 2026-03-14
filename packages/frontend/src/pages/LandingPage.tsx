import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 text-center">
        <BookOpen className="h-12 w-12 text-primary" />
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">CubeDocs</h1>
          <p className="text-lg text-muted-foreground">
            Building knowledge one step at a time.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">Register</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
