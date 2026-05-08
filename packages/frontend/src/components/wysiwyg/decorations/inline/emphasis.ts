import { Decoration } from "@codemirror/view";
import { cursorTouches, type Visitor } from "../types";

function visitWrapped(
  markName: string,
  contentClass: string,
  isUnderline: (sourceFirstChar: string) => boolean,
): Visitor {
  return ({ node, state, sel, reveal, decos }) => {
    const parent = node.node;
    let firstMark: { from: number; to: number } | null = null;
    let lastMark: { from: number; to: number } | null = null;
    let cur = parent.firstChild;
    while (cur) {
      if (cur.name === markName) {
        if (!firstMark) firstMark = { from: cur.from, to: cur.to };
        lastMark = { from: cur.from, to: cur.to };
      }
      cur = cur.nextSibling;
    }
    if (!firstMark || !lastMark) return;

    const innerFrom = firstMark.to;
    const innerTo = lastMark.from;
    if (innerFrom >= innerTo) return;

    // `__text__` parses as Strong but should render as underline.
    const useUnderline = isUnderline(state.doc.sliceString(firstMark.from, firstMark.from + 1));
    const cls = useUnderline ? "cm-underline" : contentClass;
    decos.push(Decoration.mark({ class: cls }).range(innerFrom, innerTo));

    const cursorOn = reveal && cursorTouches(sel, node.from, node.to);
    if (!cursorOn) {
      decos.push(Decoration.replace({}).range(firstMark.from, firstMark.to));
      decos.push(Decoration.replace({}).range(lastMark.from, lastMark.to));
    }
  };
}

export const visitStrong: Visitor = visitWrapped("EmphasisMark", "cm-strong", (c) => c === "_");
export const visitEmphasis: Visitor = visitWrapped("EmphasisMark", "cm-em", () => false);
export const visitStrike: Visitor = visitWrapped("StrikethroughMark", "cm-strike", () => false);
