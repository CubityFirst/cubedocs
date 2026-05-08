import { Decoration } from "@codemirror/view";
import { cursorTouches, type Visitor } from "../types";
import { HrWidget } from "../../widgets/HrWidget";

export const visitHr: Visitor = ({ node, state, sel, reveal, decos }) => {
  const line = state.doc.lineAt(node.from);
  const cursorOnLine = reveal && cursorTouches(sel, line.from, line.to);

  if (cursorOnLine) {
    decos.push(Decoration.line({ class: "cm-hr-source" }).range(line.from));
    return;
  }

  decos.push(
    Decoration.replace({ widget: new HrWidget(), block: true }).range(line.from, line.to),
  );
};
