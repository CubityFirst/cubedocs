import { WidgetType, type EditorView } from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { RendererReactContext, rendererCtxFacet } from "../context/RendererContext";
import { createElement } from "react";

export abstract class ReactWidget extends WidgetType {
  private root: Root | null = null;
  protected tag: "span" | "div" = "div";

  protected abstract render(): ReactElement;

  /**
   * Block widgets (code fence, image, callout, frontmatter, hr) override this to true.
   * When true, mousedown/click events fall through to CodeMirror so the cursor moves
   * into the widget's range, which causes the cursor-touches-block reveal to kick in.
   * Interactive widgets (dice, wikilinks) keep this false — their React handlers
   * own the click behavior.
   */
  protected revealOnClick(): boolean {
    return false;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement(this.tag);
    this.root = createRoot(el);
    const ctx = view.state.facet(rendererCtxFacet);
    this.root.render(
      createElement(RendererReactContext.Provider, { value: ctx }, this.render()),
    );
    return el;
  }

  updateDOM(_dom: HTMLElement, view: EditorView): boolean {
    if (!this.root) return false;
    const ctx = view.state.facet(rendererCtxFacet);
    this.root.render(
      createElement(RendererReactContext.Provider, { value: ctx }, this.render()),
    );
    return true;
  }

  destroy(): void {
    const root = this.root;
    this.root = null;
    if (root) queueMicrotask(() => { try { root.unmount(); } catch { /* */ } });
  }

  ignoreEvent(event: Event): boolean {
    if (this.revealOnClick() && (event.type === "mousedown" || event.type === "click")) {
      return false;
    }
    return true;
  }
}
