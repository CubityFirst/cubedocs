import { createElement, type ReactElement } from "react";
import { WidgetType } from "@codemirror/view";
import { ReactWidget } from "./ReactWidget";
import {
  Pencil, ClipboardList, Info, CheckSquare, Flame, CheckCircle,
  HelpCircle, AlertTriangle, XCircle, Zap, Bug, List, Quote,
} from "lucide-react";
import type { FC, SVGProps } from "react";

interface CalloutTypeConfig {
  label: string;
  Icon: FC<SVGProps<SVGSVGElement>>;
  tone: "zinc" | "cyan" | "blue" | "teal" | "green" | "yellow" | "amber" | "orange" | "red" | "purple";
}

export const CALLOUT_CONFIG: Record<string, CalloutTypeConfig> = {
  note:     { label: "Note",     Icon: Pencil,         tone: "zinc"   },
  abstract: { label: "Abstract", Icon: ClipboardList,  tone: "cyan"   },
  info:     { label: "Info",     Icon: Info,           tone: "blue"   },
  todo:     { label: "Todo",     Icon: CheckSquare,    tone: "blue"   },
  tip:      { label: "Tip",      Icon: Flame,          tone: "teal"   },
  success:  { label: "Success",  Icon: CheckCircle,    tone: "green"  },
  question: { label: "Question", Icon: HelpCircle,     tone: "yellow" },
  warning:  { label: "Warning",  Icon: AlertTriangle,  tone: "amber"  },
  failure:  { label: "Failure",  Icon: XCircle,        tone: "orange" },
  danger:   { label: "Danger",   Icon: Zap,            tone: "red"    },
  bug:      { label: "Bug",      Icon: Bug,            tone: "red"    },
  example:  { label: "Example",  Icon: List,           tone: "purple" },
  quote:    { label: "Quote",    Icon: Quote,          tone: "zinc"   },
};

interface Props {
  type: string;
  /** Whether the title is empty in the source — when empty, we render the canonical label after the icon. */
  showLabel: boolean;
}

function CalloutIconInner({ type, showLabel }: Props) {
  const cfg = CALLOUT_CONFIG[type] ?? CALLOUT_CONFIG.note!;
  return createElement(
    "span",
    { className: "cm-callout-icon" },
    createElement(cfg.Icon, { className: "cm-callout-icon__svg", "aria-hidden": true } as SVGProps<SVGSVGElement>),
    showLabel ? createElement("span", { className: "cm-callout-icon__label" }, cfg.label) : null,
  );
}

export class CalloutIconWidget extends ReactWidget {
  protected tag: "span" = "span";

  constructor(private readonly props: Props) {
    super();
  }

  protected render(): ReactElement {
    return createElement(CalloutIconInner, this.props);
  }

  protected revealOnClick(): boolean {
    return true;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof CalloutIconWidget &&
      other.props.type === this.props.type &&
      other.props.showLabel === this.props.showLabel
    );
  }
}
