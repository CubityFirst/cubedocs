// Remark plugin that transforms GitHub-style callout blockquotes:
//   > [!NOTE]
//   > Content
// into blockquotes with a `data-callout` hProperty so the custom
// blockquote renderer can pick them up.

const CALLOUT_TYPES = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;
const CALLOUT_RE = new RegExp(`^\\[!(${CALLOUT_TYPES.join("|")})\\]\\n?`, "i");

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: { hProperties?: Record<string, string> };
};

function walkBlockquotes(node: MdastNode) {
  if (!node.children) return;
  for (const child of node.children) {
    if (child.type === "blockquote") processBlockquote(child);
    walkBlockquotes(child);
  }
}

function processBlockquote(node: MdastNode) {
  const firstParagraph = node.children?.[0];
  if (firstParagraph?.type !== "paragraph") return;

  const firstText = firstParagraph.children?.[0];
  if (firstText?.type !== "text" || !firstText.value) return;

  const match = firstText.value.match(CALLOUT_RE);
  if (!match) return;

  const calloutType = match[1].toLowerCase();

  // Strip the [!TYPE] marker (and optional trailing newline) from the text node.
  firstText.value = firstText.value.slice(match[0].length);

  // If that paragraph is now empty, drop it so the callout body starts cleanly.
  if (!firstText.value.trim() && firstParagraph.children!.length === 1) {
    node.children!.shift();
  }

  // Attach the callout type so remark-rehype copies it to the <blockquote> element.
  node.data = node.data ?? {};
  node.data.hProperties = node.data.hProperties ?? {};
  node.data.hProperties["data-callout"] = calloutType;
}

export function remarkCallouts() {
  return (tree: MdastNode) => walkBlockquotes(tree);
}
