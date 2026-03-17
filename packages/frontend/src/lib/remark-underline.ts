// Remark plugin that treats __text__ as underline instead of bold.
// Detects strong nodes whose source starts with "_" (i.e. __text__)
// and sets hName so rehype emits <u> directly.

type MdastNode = {
  type: string;
  position?: { start?: { offset?: number } };
  data?: { hName?: string };
  children?: MdastNode[];
};

function walk(node: MdastNode, source: string) {
  if (node.type === "strong") {
    const offset = node.position?.start?.offset;
    if (offset !== undefined && source[offset] === "_") {
      node.data = node.data ?? {};
      node.data.hName = "u";
    }
  }
  if (node.children) {
    for (const child of node.children) walk(child, source);
  }
}

export function remarkUnderline() {
  return (tree: MdastNode, file: { value: string }) => {
    walk(tree, String(file.value));
  };
}
