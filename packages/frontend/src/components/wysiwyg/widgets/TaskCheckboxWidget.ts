import { WidgetType, type EditorView } from "@codemirror/view";
import { rendererCtxFacet } from "../context/RendererContext";

export class TaskCheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const ctx = view.state.facet(rendererCtxFacet);
    const editable = ctx.revealOnCursor !== false;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-task-checkbox";
    input.checked = this.checked;
    input.disabled = !editable;

    if (editable) {
      input.addEventListener("mousedown", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        // Resolve the widget's current position and find the actual
        // `[x]` / `[ ]` characters on that line (positions may have shifted).
        const pos = view.posAtDOM(input);
        const line = view.state.doc.lineAt(pos);
        const src = view.state.doc.sliceString(line.from, line.to);
        const match = src.match(/\[[ xX]\]/);
        if (!match || match.index === undefined) return;
        const from = line.from + match.index;
        const next = this.checked ? "[ ]" : "[x]";
        view.dispatch({
          changes: { from, to: from + 3, insert: next },
          userEvent: "input.toggle-task",
        });
      });
    }

    return input;
  }

  eq(other: WidgetType): boolean {
    return other instanceof TaskCheckboxWidget && other.checked === this.checked;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
