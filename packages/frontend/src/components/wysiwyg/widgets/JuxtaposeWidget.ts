import { createElement, type ReactElement } from "react";
import { WidgetType } from "@codemirror/view";
import { ReactWidget } from "./ReactWidget";
import { JuxtaposeCompare } from "@/components/JuxtaposeCompare";
import type { JuxtaposeConfig } from "@/lib/juxtapose";

export class JuxtaposeWidget extends ReactWidget {
  constructor(
    private readonly cfg: JuxtaposeConfig,
    /** Reading/published view → draggable; Editing view → static + click-to-reveal. */
    private readonly interactive: boolean,
  ) {
    super();
    this.tag = "div";
  }

  protected render(): ReactElement {
    return createElement(JuxtaposeCompare, { ...this.cfg, interactive: this.interactive });
  }

  // In the editor (non-interactive) a click should fall through to CodeMirror so
  // the raw block is revealed for editing, like images and other block widgets.
  protected revealOnClick(): boolean {
    return !this.interactive;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof JuxtaposeWidget &&
      other.interactive === this.interactive &&
      other.cfg.before === this.cfg.before &&
      other.cfg.after === this.cfg.after &&
      other.cfg.beforeLabel === this.cfg.beforeLabel &&
      other.cfg.afterLabel === this.cfg.afterLabel &&
      other.cfg.orientation === this.cfg.orientation &&
      other.cfg.startAt === this.cfg.startAt &&
      other.cfg.handle === this.cfg.handle &&
      other.cfg.accent === this.cfg.accent
    );
  }
}
