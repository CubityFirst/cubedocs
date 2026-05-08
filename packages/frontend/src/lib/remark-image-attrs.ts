// Remark plugin adding support for Pandoc-style image attribute syntax:
//   ![alt](url){width=50% height=200px}

import { ATTR_BLOCK_RE, parseImageAttrs, styleFromAttrs } from "./imageAttrs";

type MdastNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
  data?: { hProperties?: Record<string, string> };
};

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
    const style = styleFromAttrs(attrs);
    if (!style) continue;

    child.data = child.data ?? {};
    child.data.hProperties = child.data.hProperties ?? {};
    child.data.hProperties["style"] = style;

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
