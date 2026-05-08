import type { Range } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import type { EditorState, SelectionRange } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import type { RendererCtx } from "../context/RendererContext";

export type DecoRange = Range<Decoration>;

export interface VisitorArgs {
  node: SyntaxNodeRef;
  state: EditorState;
  sel: SelectionRange;
  reveal: boolean;
  ctx: RendererCtx;
  decos: DecoRange[];
}

export type Visitor = (args: VisitorArgs) => void;

export function cursorTouches(sel: SelectionRange, from: number, to: number): boolean {
  return sel.from <= to && sel.to >= from;
}
