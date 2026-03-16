// Remark plugin adding support for Pandoc-style image attribute syntax:
//   ![alt](url){width=50% height=200px}
//
// Supported attributes: width, height (quoted or unquoted values)
// Unsupported / silently ignored: .class, #id, other key=value pairs
//
// After remark parses ![alt](url), the {…} becomes a text node immediately
// following the image in the same paragraph — this plugin stitches them together.

type MdastNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
  data?: { hProperties?: Record<string, string> };
};

// Matches a Pandoc attribute block at the start of a string: {key=val …}
const ATTR_BLOCK_RE = /^\{([^}]*)\}/;

// Matches a single key="value" or key=value pair
const KV_RE = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;

function parseAttrs(block: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = KV_RE.exec(block)) !== null) {
    const key = m[1];
    const val = m[2] ?? m[3] ?? m[4];
    attrs[key] = val;
  }
  return attrs;
}

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

    const attrs = parseAttrs(match[1]);
    const { width, height } = attrs;
    if (!width && !height) continue;

    // Apply as inline styles so they override prose's `height: auto` rule
    child.data = child.data ?? {};
    child.data.hProperties = child.data.hProperties ?? {};
    const styleParts: string[] = [];
    if (width) styleParts.push(`width: ${width}`);
    if (height) styleParts.push(`height: ${height}`);
    child.data.hProperties["style"] = styleParts.join("; ");

    // Strip the {…} from the following text node
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
