import { Decoration } from "@codemirror/view";
import { cursorTouches, type Visitor } from "../types";
import { DiceWidget } from "../../widgets/DiceWidget";

// Inline `dice: …` is detected post-hoc inside the InlineCode visitor so we don't
// need a Lezer extension. This visitor is called by the walker only when the
// inline-code content starts with "dice:".
export const visitDice: Visitor = ({ node, state, sel, reveal, decos }) => {
  const parent = node.node;
  let firstMark: { from: number; to: number } | null = null;
  let lastMark: { from: number; to: number } | null = null;
  let cur = parent.firstChild;
  while (cur) {
    if (cur.name === "CodeMark") {
      if (!firstMark) firstMark = { from: cur.from, to: cur.to };
      lastMark = { from: cur.from, to: cur.to };
    }
    cur = cur.nextSibling;
  }
  if (!firstMark || !lastMark) return;

  const cursorOn = reveal && cursorTouches(sel, node.from, node.to);
  if (cursorOn) {
    decos.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
    return;
  }

  const inner = state.doc.sliceString(firstMark.to, lastMark.from).slice("dice:".length).trim();
  decos.push(
    Decoration.replace({ widget: new DiceWidget(inner) }).range(node.from, node.to),
  );
};
