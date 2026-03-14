import { Info, Lightbulb, AlertCircle, AlertTriangle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type CalloutType = "note" | "tip" | "important" | "warning" | "caution";

const CALLOUT_CONFIG: Record<
  CalloutType,
  { label: string; Icon: React.FC<React.SVGProps<SVGSVGElement>>; classes: string }
> = {
  note: {
    label: "Note",
    Icon: Info,
    classes:
      "border-blue-400/50 bg-blue-50/10 text-blue-300 dark:border-blue-400/40 dark:bg-blue-900/10",
  },
  tip: {
    label: "Tip",
    Icon: Lightbulb,
    classes:
      "border-green-400/50 bg-green-50/10 text-green-300 dark:border-green-400/40 dark:bg-green-900/10",
  },
  important: {
    label: "Important",
    Icon: AlertCircle,
    classes:
      "border-purple-400/50 bg-purple-50/10 text-purple-300 dark:border-purple-400/40 dark:bg-purple-900/10",
  },
  warning: {
    label: "Warning",
    Icon: AlertTriangle,
    classes:
      "border-amber-400/50 bg-amber-50/10 text-amber-300 dark:border-amber-400/40 dark:bg-amber-900/10",
  },
  caution: {
    label: "Caution",
    Icon: AlertOctagon,
    classes:
      "border-red-400/50 bg-red-50/10 text-red-300 dark:border-red-400/40 dark:bg-red-900/10",
  },
};

interface CalloutProps {
  type: CalloutType;
  children: ReactNode;
}

export function Callout({ type, children }: CalloutProps) {
  const config = CALLOUT_CONFIG[type] ?? CALLOUT_CONFIG.note;
  const { label, Icon, classes } = config;

  return (
    <div
      className={cn(
        "not-prose my-4 rounded-md border px-4 py-3 text-sm",
        classes,
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {label}
      </div>
      <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p]:my-1 [&_a]:underline [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1">
        {children}
      </div>
    </div>
  );
}
