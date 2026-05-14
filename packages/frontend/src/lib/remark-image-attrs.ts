// Remark plugin adding support for Pandoc-style image attribute syntax:
//   ![alt](url){width=50% height=200px}
//
// Audio extensions also flow through ![](…); the {size=full|small} attr is
// forwarded as `data-size` so the rendering layer can pick a player variant.

import { ATTR_BLOCK_RE, parseImageAttrs, styleFromAttrs } from "./imageAttrs";

type MdastNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
  data?: { hProperties?: Record<string, string> };
};

const KNOWN_ATTRS = new Set(["width", "height", "align", "size"]);

function processParagraph(node: MdastNode) {
  const children = node.children;
  if (!children) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type !== "image") continue;

    const next = children[i + 1];
    if (!next || next.type !== "text" || !next.value) continue;

    const match = next.value.match(ATTR_BLOCK_RE);
    if (!match) continue;

    const attrs = parseImageAttrs(match[1]);
    const hasKnown = Object.keys(attrs).some(k => KNOWN_ATTRS.has(k));
    if (!hasKnown) continue;

    const style = styleFromAttrs(attrs);
    const size = attrs.size;

    child.data = child.data ?? {};
    child.data.hProperties = child.data.hProperties ?? {};
    if (style) child.data.hProperties["style"] = style;
    if (size === "full" || size === "small") child.data.hProperties["data-size"] = size;

    const remainder = next.value.slice(match[0].length);
    if (remainder) {
      next.value = remainder;
    } else {
      children.splice(i + 1, 1);
    }
  }
}

function walk(node: MdastNode) {
  if (node.type === "paragraph") processParagraph(node);
  if (node.children) {
    for (const child of node.children) walk(child);
  }
}

export function remarkImageAttrs() {
  return (tree: MdastNode) => walk(tree);
}
