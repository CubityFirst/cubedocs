// Remark plugin implementing the Obsidian callout spec:
// https://help.obsidian.md/callouts
//
// Syntax:
//   > [!type]            – basic callout
//   > [!type] Title      – custom title
//   > [!type]+           – foldable, expanded by default
//   > [!type]- Title     – foldable with custom title, collapsed by default
//
// Nested callouts are supported naturally via nested blockquotes.

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: { hProperties?: Record<string, string> };
};

// Canonical types
const CANONICAL_TYPES = new Set([
  "note", "abstract", "info", "todo", "tip", "success",
  "question", "warning", "failure", "danger", "bug", "example", "quote",
]);

// Aliases → canonical type
const ALIASES: Record<string, string> = {
  summary: "abstract",
  tldr: "abstract",
  hint: "tip",
  important: "tip",
  check: "success",
  done: "success",
  help: "question",
  faq: "question",
  caution: "warning",
  attention: "warning",
  fail: "failure",
  missing: "failure",
  error: "danger",
  cite: "quote",
};

// Matches: [!type][-+]? optional title
const CALLOUT_LINE_RE = /^\[!([a-zA-Z]+)\]([+\-]?)\s*(.*)/;

function resolveType(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (CANONICAL_TYPES.has(lower)) return lower;
  return ALIASES[lower] ?? null;
}

function walkBlockquotes(node: MdastNode) {
  if (!node.children) return;
  for (const child of node.children) {
    if (child.type === "blockquote") processBlockquote(child);
    walkBlockquotes(child); // recurse for nesting
  }
}

function processBlockquote(node: MdastNode) {
  const firstParagraph = node.children?.[0];
  if (firstParagraph?.type !== "paragraph") return;

  const firstText = firstParagraph.children?.[0];
  if (firstText?.type !== "text" || !firstText.value) return;

  // Match only the first line of the text node
  const firstLine = firstText.value.split("\n")[0];
  const match = firstLine.match(CALLOUT_LINE_RE);
  if (!match) return;

  const resolvedType = resolveType(match[1]);
  if (!resolvedType) return;

  const fold = match[2];   // '+', '-', or ''
  const title = match[3].trim(); // custom title (may be empty)

  // Strip the [!type] first line from the text node
  firstText.value = firstText.value.slice(firstLine.length);
  if (firstText.value.startsWith("\n")) firstText.value = firstText.value.slice(1);

  // If the paragraph is now empty, remove it so the body starts cleanly
  if (!firstText.value && firstParagraph.children!.length === 1) {
    node.children!.shift();
  }

  // Pass callout metadata via hProperties so rehype copies them to the element
  node.data = node.data ?? {};
  node.data.hProperties = node.data.hProperties ?? {};
  node.data.hProperties["data-callout"] = resolvedType;
  if (fold) node.data.hProperties["data-callout-fold"] = fold;
  if (title) node.data.hProperties["data-callout-title"] = title;
}

export function remarkCallouts() {
  return (tree: MdastNode) => walkBlockquotes(tree);
}
