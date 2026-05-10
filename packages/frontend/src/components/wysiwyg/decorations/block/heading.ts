import { Decoration } from "@codemirror/view";
import { cursorTouches, type Visitor } from "../types";
import { toHeadingId } from "@/lib/headingSlug";
import { HeadingAnchorWidget } from "../../widgets/HeadingAnchorWidget";

export const visitHeading: Visitor = ({ node, state, sel, reveal, decos }) => {
  const atxMatch = node.name.match(/^ATXHeading(\d)$/);
  if (!atxMatch) return; // Setext deferred
  const level = Math.min(parseInt(atxMatch[1]!, 10), 6);

  const line = state.doc.lineAt(node.from);
  const m = state.doc.sliceString(line.from, line.to).match(/^#{1,6}\s+(.+?)\s*$/);
  const slug = m ? toHeadingId(m[1]) : "";

  const spec: { class: string; attributes?: { id: string } } = { class: `cm-h${level}` };
  if (slug) spec.attributes = { id: slug };
  decos.push(Decoration.line(spec).range(line.from));

  const cursorOnLine = reveal && cursorTouches(sel, line.from, line.to);
  if (cursorOnLine) return;

  // In reading mode, append a click-to-copy heading-link icon at the end of
  // the line. Hidden by default; CSS reveals it on line hover.
  if (!reveal && slug) {
    decos.push(
      Decoration.widget({ widget: new HeadingAnchorWidget(slug), side: 1 }).range(line.to),
    );
  }

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
