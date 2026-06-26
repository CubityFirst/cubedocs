import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// shadcn-style loading spinner: a spinning lucide icon. Size via className
// (defaults to h-4 w-4). role/aria-label so it's announced to assistive tech.
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      className={cn("h-4 w-4 animate-spin text-muted-foreground", className)}
    />
  );
}
