import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { decorationField } from "./decorations";
import { rendererCtxFacet, type RendererCtx } from "./context/RendererContext";

export type WysiwygMode = "reading" | "editing" | "raw";

export const modeCompartment = new Compartment();
export const ctxCompartment = new Compartment();

export function ctxExtension(ctx: RendererCtx): Extension {
  return rendererCtxFacet.of(ctx);
}

export function modeExtension(mode: WysiwygMode): Extension {
  switch (mode) {
    case "reading":
      return [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        decorationField,
      ];
    case "editing":
      return [decorationField];
    case "raw":
      return [];
  }
}

export function buildCtxForMode(ctx: RendererCtx, mode: WysiwygMode): RendererCtx {
  return { ...ctx, revealOnCursor: mode === "editing" };
}
