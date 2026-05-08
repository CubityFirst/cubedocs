import { Decoration } from "@codemirror/view";
import { cursorTouches, type Visitor } from "../types";
import { ImageWidget } from "../../widgets/ImageWidget";
import { ATTR_BLOCK_RE, parseImageAttrs, styleFromAttrs } from "@/lib/imageAttrs";

const IMG_RE = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)$/;

export const visitImage: Visitor = ({ node, state, sel, reveal, decos }) => {
  const fullSrc = state.doc.sliceString(node.from, node.to);
  const m = fullSrc.match(IMG_RE);
  if (!m) return;
  const alt = m[1] ?? "";
  const url = m[2] ?? "";

  // Peek at trailing {width=…} attribute block
  const lookahead = state.doc.sliceString(node.to, Math.min(node.to + 200, state.doc.length));
  const attrMatch = lookahead.match(ATTR_BLOCK_RE);
  let style: string | undefined;
  let consumeTo = node.to;
  if (attrMatch) {
    const attrs = parseImageAttrs(attrMatch[1]!);
    const s = styleFromAttrs(attrs);
    if (s) {
      style = s;
      consumeTo = node.to + attrMatch[0].length;
    }
  }

  // Block layout when the image (with optional attrs) is the only non-whitespace
  // content on its line — replace the whole line with a block widget.
  const line = state.doc.lineAt(node.from);
  const before = state.doc.sliceString(line.from, node.from);
  const after = state.doc.sliceString(consumeTo, line.to);
  const inline = before.trim().length > 0 || after.trim().length > 0;

  // Reveal scope: for inline images, only the image+attrs range itself; for
  // block images, the whole line (since the line IS the image).
  const revealFrom = inline ? node.from : line.from;
  const revealTo = inline ? consumeTo : line.to;
  const cursorOn = reveal && cursorTouches(sel, revealFrom, revealTo);
  if (cursorOn) return;

  if (inline) {
    decos.push(
      Decoration.replace({
        widget: new ImageWidget({ src: url, alt, style, inline: true }),
      }).range(node.from, consumeTo),
    );
  } else {
    decos.push(
      Decoration.replace({
        widget: new ImageWidget({ src: url, alt, style, inline: false }),
        block: true,
      }).range(line.from, line.to),
    );
  }
};
