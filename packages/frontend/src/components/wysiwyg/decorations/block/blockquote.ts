import { Decoration } from "@codemirror/view";
import { cursorTouches, type Visitor } from "../types";
import { tryVisitCallout } from "./callout";

export const visitBlockquote: Visitor = (args) => {
  if (tryVisitCallout(args)) return;

  const { node, state, sel, reveal, decos } = args;
  const startLine = state.doc.lineAt(node.from).number;
  const endLine = state.doc.lineAt(Math.min(node.to, state.doc.length)).number;

  for (let n = startLine; n <= endLine; n++) {
    const line = state.doc.line(n);
    decos.push(Decoration.line({ class: "cm-blockquote" }).range(line.from));

    // Per-line reveal: only the cursor's line keeps its raw "> " marker
    // visible; other lines hide it so the rendered blockquote reads cleanly.
    const cursorOnThisLine = reveal && cursorTouches(sel, line.from, line.to);
    if (cursorOnThisLine) continue;

    const lineSrc = state.doc.sliceString(line.from, line.to);
    const m = lineSrc.match(/^>\s?/);
    if (m && m[0].length > 0) {
      decos.push(Decoration.replace({}).range(line.from, line.from + m[0].length));
    }
  }
};
