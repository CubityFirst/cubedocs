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

import { CALLOUT_LINE_RE, resolveCalloutType } from "./callout";

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
    walkBlockquotes(child); // recurse for nesting
  }
}

function processBlockquote(node: MdastNode) {
  const firstParagraph = node.children?.[0];
  if (firstParagraph?.type !== "paragraph") return;

  const firstText = firstParagraph.children?.[0];
  if (firstText?.type !== "text" || !firstText.value) return;

  const firstLine = firstText.value.split("\n")[0];
  const match = firstLine.match(CALLOUT_LINE_RE);
  if (!match) return;

  const resolvedType = resolveCalloutType(match[1]);
  if (!resolvedType) return;

  const fold = match[2];
  const title = match[3].trim();

  firstText.value = firstText.value.slice(firstLine.length);
  if (firstText.value.startsWith("\n")) firstText.value = firstText.value.slice(1);

  if (!firstText.value && firstParagraph.children!.length === 1) {
    node.children!.shift();
  }

  node.data = node.data ?? {};
  node.data.hProperties = node.data.hProperties ?? {};
  node.data.hProperties["data-callout"] = resolvedType;
  if (fold) node.data.hProperties["data-callout-fold"] = fold;
  if (title) node.data.hProperties["data-callout-title"] = title;
}

export function remarkCallouts() {
  return (tree: MdastNode) => walkBlockquotes(tree);
}
