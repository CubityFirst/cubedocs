import { createElement, type ReactElement } from "react";
import { WidgetType, type EditorView } from "@codemirror/view";
import { ReactWidget } from "./ReactWidget";
import { CodeBlock } from "@/components/CodeBlock";

export class CodeFenceWidget extends ReactWidget {
  protected tag: "div" = "div";

  constructor(
    private readonly lang: string,
    private readonly code: string,
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const el = super.toDOM(view);
    // Tag the widget root so CSS can neutralize CodeBlock's my-4 (margin lives
    // outside the bounding rect; CM6's heightmap would then underestimate the
    // widget's height and clicks below the block would land on wrong lines).
    el.classList.add("cm-codefence-widget-root");
    return el;
  }

  protected render(): ReactElement {
    return createElement(CodeBlock, { lang: this.lang, code: this.code });
  }

  protected revealOnClick(): boolean {
    return true;
  }

  eq(other: WidgetType): boolean {
    return other instanceof CodeFenceWidget && other.lang === this.lang && other.code === this.code;
  }
}
