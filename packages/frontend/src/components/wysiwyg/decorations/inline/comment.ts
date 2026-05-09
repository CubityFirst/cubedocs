import { Decoration } from "@codemirror/view";
import type { Visitor } from "../types";

export const visitComment: Visitor = ({ node, reveal, decos }) => {
  // Reading mode (reveal === false): hide the entire comment from view.
  if (!reveal) {
    decos.push(Decoration.replace({}).range(node.from, node.to));
    return;
  }
  // Editing mode: show the whole `%% ... %%` in muted gray so the author can
  // see and edit their comments.
  decos.push(Decoration.mark({ class: "cm-comment" }).range(node.from, node.to));
};
