import { Decoration } from "@codemirror/view";
import { cursorTouches, type Visitor } from "../types";
import { visitDice } from "./dice";

export const visitInlineCode: Visitor = (args) => {
  const { node, state, sel, reveal, decos } = args;
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

  const innerSrc = state.doc.sliceString(firstMark.to, lastMark.from);
  if (innerSrc.startsWith("dice:")) {
    visitDice(args);
    return;
  }

  decos.push(Decoration.mark({ class: "cm-inline-code", inclusive: false }).range(node.from, node.to));

  const cursorOn = reveal && cursorTouches(sel, node.from, node.to);
  if (!cursorOn) {
    decos.push(Decoration.replace({ atomicHide: true }).range(firstMark.from, firstMark.to));
    decos.push(Decoration.replace({ atomicHide: true }).range(lastMark.from, lastMark.to));
  }
};
