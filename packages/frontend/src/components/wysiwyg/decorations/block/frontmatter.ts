import { Decoration } from "@codemirror/view";
import type { EditorState, SelectionRange } from "@codemirror/state";
import { cursorTouches } from "../types";
import type { DecoRange } from "../types";
import { FrontmatterWidget } from "../../widgets/FrontmatterWidget";
import type { RendererCtx } from "../../context/RendererContext";

const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

export interface FrontmatterRange {
  from: number;
  to: number;
}

// Returns the detected frontmatter range so the walker can skip nodes inside it
// (otherwise Lezer parses the `---` lines as HorizontalRule and stacks an HR
// widget on top of the frontmatter region).
export function frontmatterPass(
  state: EditorState,
  sel: SelectionRange,
  reveal: boolean,
  ctx: RendererCtx,
  decos: DecoRange[],
): FrontmatterRange | null {
  const head = state.doc.sliceString(0, Math.min(state.doc.length, 4096));
  const m = head.match(FM_REGEX);
  if (!m) return null;
  const blockEnd = m[0].length - (m[2]?.length ?? 0);
  if (blockEnd <= 0) return null;

  const startLine = state.doc.lineAt(0);
  const endLine = state.doc.lineAt(Math.min(blockEnd, state.doc.length));
  const range: FrontmatterRange = { from: startLine.from, to: endLine.to };

  // Reading mode (or explicit hideFrontmatter) hides the YAML block entirely.
  if (!reveal || ctx.hideFrontmatter) {
    decos.push(
      Decoration.replace({ block: true }).range(range.from, range.to),
    );
    return range;
  }

  const cursorIn = cursorTouches(sel, range.from, range.to);
  if (cursorIn) return range; // editing mode + cursor inside → show raw YAML

  decos.push(
    Decoration.replace({
      widget: new FrontmatterWidget(m[1] ?? ""),
      block: true,
    }).range(range.from, range.to),
  );
  return range;
}
