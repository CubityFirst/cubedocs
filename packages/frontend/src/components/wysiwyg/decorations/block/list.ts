import { Decoration, WidgetType } from "@codemirror/view";
import { cursorTouches, type Visitor } from "../types";
import { TaskCheckboxWidget } from "../../widgets/TaskCheckboxWidget";

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-list-bullet-marker";
    span.textContent = "•";
    return span;
  }
  eq(other: WidgetType): boolean {
    return other instanceof BulletWidget;
  }
  ignoreEvent(event: Event): boolean {
    if (event.type === "mousedown" || event.type === "click") return false;
    return true;
  }
}

export const visitListItem: Visitor = ({ node, state, sel, reveal, decos }) => {
  const parent = node.node;
  let mark: { from: number; to: number } | null = null;
  let cur = parent.firstChild;
  while (cur) {
    if (cur.name === "ListMark") {
      mark = { from: cur.from, to: cur.to };
      break;
    }
    cur = cur.nextSibling;
  }
  if (!mark) return;

  const list = parent.parent;
  const isOrdered = list?.name === "OrderedList";

  // Detect GFM task list pattern: "- [x]" / "- [ ]" / "* [X]" etc.
  let task: { boxFrom: number; boxTo: number; checked: boolean; hideTo: number } | null = null;
  if (!isOrdered) {
    const after = state.doc.sliceString(mark.to, Math.min(mark.to + 6, state.doc.length));
    const taskMatch = after.match(/^(\s+)(\[[ xX]\])/);
    if (taskMatch) {
      const boxFrom = mark.to + taskMatch[1]!.length;
      const boxTo = boxFrom + 3;
      const checked = taskMatch[2]!.toLowerCase() === "[x]";
      const trailing = state.doc.sliceString(boxTo, boxTo + 1);
      const hideTo = trailing === " " ? boxTo + 1 : boxTo;
      task = { boxFrom, boxTo, checked, hideTo };
    }
  }

  const lineClass = task
    ? "cm-list-task-item"
    : isOrdered
      ? "cm-list-ordered-item"
      : "cm-list-bullet-item";

  const startLineNum = state.doc.lineAt(node.from).number;
  const endLineNum = state.doc.lineAt(Math.min(node.to, state.doc.length)).number;
  for (let n = startLineNum; n <= endLineNum; n++) {
    const lineN = state.doc.line(n);
    decos.push(Decoration.line({ class: lineClass }).range(lineN.from));
  }

  const cursorInItem = reveal && cursorTouches(sel, node.from, node.to);
  if (cursorInItem) return;

  if (task) {
    // Replace "- [x] " (or "[ ]") with the checkbox widget
    decos.push(
      Decoration.replace({
        widget: new TaskCheckboxWidget(task.checked),
      }).range(mark.from, task.hideTo),
    );
  } else if (isOrdered) {
    decos.push(
      Decoration.mark({ class: "cm-list-ordered-marker" }).range(mark.from, mark.to),
    );
  } else {
    const after = state.doc.sliceString(mark.to, mark.to + 1);
    const hideTo = after === " " ? mark.to + 1 : mark.to;
    decos.push(
      Decoration.replace({ widget: new BulletWidget() }).range(mark.from, hideTo),
    );
  }
};
