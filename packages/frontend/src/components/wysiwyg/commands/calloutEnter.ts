import { syntaxTree } from "@codemirror/language";
import type { Command, EditorView } from "@codemirror/view";
import { parseCalloutHeader } from "@/lib/callout";

function isInsideCallout(view: EditorView): boolean {
  const sel = view.state.selection.main;
  const tree = syntaxTree(view.state);
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(sel.from, -1);
  while (node && node.name !== "Blockquote") {
    node = node.parent;
  }
  if (!node) return false;

  const firstLine = view.state.doc.lineAt(node.from);
  const firstSrc = view.state.doc.sliceString(firstLine.from, firstLine.to);
  const stripped = firstSrc.replace(/^>\s?/, "");
  return parseCalloutHeader(stripped) !== null;
}

/** Enter inside a callout: insert "\n> " so the next line continues the callout. */
export const calloutContinueOnEnter: Command = (view) => {
  if (!isInsideCallout(view)) return false;
  const sel = view.state.selection.main;
  const insert = "\n> ";
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: sel.from + insert.length },
    scrollIntoView: true,
    userEvent: "input.type",
  });
  return true;
};

/** Shift+Enter inside a callout: insert plain "\n" to break out of the callout. */
export const calloutBreakOnShiftEnter: Command = (view) => {
  if (!isInsideCallout(view)) return false;
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: "\n" },
    selection: { anchor: sel.from + 1 },
    scrollIntoView: true,
    userEvent: "input.type",
  });
  return true;
};
