import * as React from "react";
import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "pointer-events-none select-none rounded border border-border bg-muted px-1 font-mono text-[10px]",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
