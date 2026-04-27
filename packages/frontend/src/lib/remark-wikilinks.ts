import { defaultUrlTransform } from "react-markdown";

type MdastNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
};

// react-markdown's default urlTransform sanitizes any unknown protocol
// (including doc://) to an empty string. Pass this as `urlTransform` so that
// wikilink-generated `doc://` hrefs survive long enough to reach <DocLink>.
export function wikilinkUrlTransform(url: string): string {
  if (url.startsWith("doc://")) return url;
  return defaultUrlTransform(url);
}

// Matches [[Title]], [[Title|Display]], [[Title#anchor]], [[Title#anchor|Display]]
const WIKILINK_RE = /\[\[([^\]#|]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g;

function isRelativeDocUrl(url: string): boolean {
  return (
    !url.includes("://") &&
    !url.startsWith("#") &&
    !url.startsWith("/") &&
    !url.startsWith("mailto:") &&
    !url.startsWith("tel:") &&
    !url.startsWith("data:") &&
    url.trim().length > 0
  );
}

function toDocUrl(title: string, anchor?: string): string {
  const base = "doc://" + encodeURIComponent(title);
  return anchor ? base + "#" + anchor : base;
}

function normalizeRelativeUrl(url: string): string {
  let title = url;
  const hashIdx = title.indexOf("#");
  let anchor: string | undefined;
  if (hashIdx !== -1) {
    anchor = title.slice(hashIdx + 1);
    title = title.slice(0, hashIdx);
  }
  if (title.startsWith("./")) title = title.slice(2);
  if (title.endsWith(".md")) title = title.slice(0, -3);
  return toDocUrl(decodeURIComponent(title).trim(), anchor);
}

function expandWikilinks(text: string): MdastNode[] {
  const nodes: MdastNode[] = [];
  let lastIndex = 0;
  WIKILINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const title = match[1].trim();
    const anchor = match[2]?.trim();
    const display = match[3]?.trim() ?? title;
    nodes.push({
      type: "link",
      url: toDocUrl(title, anchor),
      children: [{ type: "text", value: display }],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push({ type: "text", value: text.slice(lastIndex) });
  }
  return nodes;
}

function walk(node: MdastNode, parent?: MdastNode, index?: number) {
  if (node.type === "link" && node.url && isRelativeDocUrl(node.url)) {
    node.url = normalizeRelativeUrl(node.url);
  }
  if (node.type === "text" && node.value && parent?.children) {
    const replacements = expandWikilinks(node.value);
    if (replacements.length > 1 || (replacements.length === 1 && replacements[0].type !== "text")) {
      parent.children.splice(index!, 1, ...replacements);
      return replacements.length - 1; // extra nodes inserted
    }
  }
  if (node.children) {
    let i = 0;
    while (i < node.children.length) {
      const extra = walk(node.children[i], node, i) ?? 0;
      i += 1 + extra;
    }
  }
  return 0;
}

export function remarkWikilinks() {
  return (tree: MdastNode) => { walk(tree); };
}
