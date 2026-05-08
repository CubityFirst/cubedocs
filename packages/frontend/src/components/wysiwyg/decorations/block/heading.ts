import { Decoration } from "@codemirror/view";
import { cursorTouches, type Visitor } from "../types";

export const visitHeading: Visitor = ({ node, state, sel, reveal, decos }) => {
  const atxMatch = node.name.match(/^ATXHeading(\d)$/);
  if (!atxMatch) return; // Setext deferred
  const level = Math.min(parseInt(atxMatch[1]!, 10), 6);

  const line = state.doc.lineAt(node.from);
  decos.push(Decoration.line({ class: `cm-h${level}` }).range(line.from));

  const cursorOnLine = reveal && cursorTouches(sel, line.from, line.to);
  if (cursorOnLine) return;

  // Find the leading HeaderMark and hide it (plus the trailing space if present)
  const parent = node.node;
  let cur = parent.firstChild;
  while (cur) {
    if (cur.name === "HeaderMark") {
      const after = state.doc.sliceString(cur.to, cur.to + 1);
      const hideTo = after === " " ? cur.to + 1 : cur.to;
      decos.push(Decoration.replace({}).range(cur.from, hideTo));
      return;
    }
    cur = cur.nextSibling;
  }
};
