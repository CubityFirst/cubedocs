import { WidgetType } from "@codemirror/view";

export class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-wysiwyg-hr";
    const hr = document.createElement("hr");
    wrap.appendChild(hr);
    return wrap;
  }

  eq(other: WidgetType): boolean {
    return other instanceof HrWidget;
  }

  ignoreEvent(event: Event): boolean {
    if (event.type === "mousedown" || event.type === "click") return false;
    return true;
  }
}
