import { StateField } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import { buildDecorations } from "./walker";
import { rendererCtxFacet } from "../context/RendererContext";

// Block decorations (HR, code fences, callouts, frontmatter, etc.) are not
// allowed from ViewPlugins — CM6 throws "Block decorations may not be specified
// via plugins". A StateField is the supported source for block decorations.
export const decorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, tr) {
    const ctxChanged =
      tr.startState.facet(rendererCtxFacet) !== tr.state.facet(rendererCtxFacet);
    if (!tr.docChanged && !tr.selection && !ctxChanged) {
      return decorations.map(tr.changes);
    }
    return buildDecorations(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f),
});
