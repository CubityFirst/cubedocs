import {
  Pencil,
  ClipboardList,
  Info,
  CheckSquare,
  Flame,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  XCircle,
  Zap,
  Bug,
  List,
  Quote,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode, FC, SVGProps } from "react";

export type CalloutType =
  | "note" | "abstract" | "info" | "todo"
  | "tip" | "success" | "question" | "warning"
  | "failure" | "danger" | "bug" | "example" | "quote";

type CalloutConfig = {
  label: string;
  Icon: FC<SVGProps<SVGSVGElement>>;
  /** Tailwind classes for: border, background, icon/title color */
  border: string;
  bg: string;
  accent: string;
};

const CONFIG: Record<CalloutType, CalloutConfig> = {
  note: {
    label: "Note",
    Icon: Pencil,
    border: "border-zinc-400/50",
    bg: "bg-zinc-500/10",
    accent: "text-zinc-400",
  },
  abstract: {
    label: "Abstract",
    Icon: ClipboardList,
    border: "border-cyan-400/50",
    bg: "bg-cyan-500/10",
    accent: "text-cyan-400",
  },
  info: {
    label: "Info",
    Icon: Info,
    border: "border-blue-400/50",
    bg: "bg-blue-500/10",
    accent: "text-blue-400",
  },
  todo: {
    label: "Todo",
    Icon: CheckSquare,
    border: "border-blue-400/50",
    bg: "bg-blue-500/10",
    accent: "text-blue-400",
  },
  tip: {
    label: "Tip",
    Icon: Flame,
    border: "border-teal-400/50",
    bg: "bg-teal-500/10",
    accent: "text-teal-400",
  },
  success: {
    label: "Success",
    Icon: CheckCircle,
    border: "border-green-400/50",
    bg: "bg-green-500/10",
    accent: "text-green-400",
  },
  question: {
    label: "Question",
    Icon: HelpCircle,
    border: "border-yellow-400/50",
    bg: "bg-yellow-500/10",
    accent: "text-yellow-400",
  },
  warning: {
    label: "Warning",
    Icon: AlertTriangle,
    border: "border-amber-400/50",
    bg: "bg-amber-500/10",
    accent: "text-amber-400",
  },
  failure: {
    label: "Failure",
    Icon: XCircle,
    border: "border-orange-400/50",
    bg: "bg-orange-500/10",
    accent: "text-orange-400",
  },
  danger: {
    label: "Danger",
    Icon: Zap,
    border: "border-red-400/50",
    bg: "bg-red-500/10",
    accent: "text-red-400",
  },
  bug: {
    label: "Bug",
    Icon: Bug,
    border: "border-red-400/50",
    bg: "bg-red-500/10",
    accent: "text-red-400",
  },
  example: {
    label: "Example",
    Icon: List,
    border: "border-purple-400/50",
    bg: "bg-purple-500/10",
    accent: "text-purple-400",
  },
  quote: {
    label: "Quote",
    Icon: Quote,
    border: "border-zinc-400/50",
    bg: "bg-zinc-500/10",
    accent: "text-zinc-400",
  },
};

interface CalloutProps {
  type: CalloutType;
  /** Custom title from `[!type] Custom Title` syntax. Falls back to the type label. */
  title?: string;
  /** '+' = foldable open by default, '-' = foldable closed by default, absent = not foldable */
  fold?: string;
  children: ReactNode;
}

export function Callout({ type, title, fold, children }: CalloutProps) {
  const config = CONFIG[type] ?? CONFIG.note;
  const { label, Icon, border, bg, accent } = config;
  const displayTitle = title || label;
  const isFoldable = fold === "+" || fold === "-";

  const header = (
    <div className={cn("flex items-center gap-1.5 text-sm font-semibold", accent)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{displayTitle}</span>
      {isFoldable && (
        <ChevronDown
          className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", fold === "-" && "-rotate-90")}
          aria-hidden
        />
      )}
    </div>
  );

  const body = (
    <div className="mt-2 text-sm [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p]:my-1">
      {children}
    </div>
  );

  const containerClass = cn(
    "not-prose my-4 rounded-md border-l-4 px-4 py-3",
    border,
    bg,
  );

  if (isFoldable) {
    return (
      <details className={containerClass} open={fold === "+"}>
        <summary className="cursor-pointer list-none">{header}</summary>
        {body}
      </details>
    );
  }

  return (
    <div className={containerClass}>
      {header}
      {body}
    </div>
  );
}
