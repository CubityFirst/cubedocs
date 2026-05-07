import { describe, it, expect } from "vitest";
import { remarkUnderline } from "./remark-underline";

type Node = Record<string, unknown> & { children?: Node[]; position?: { start?: { offset?: number } } };

function run(tree: Node, source: string) {
  remarkUnderline()(tree as never, { value: source });
}

function strongAt(offset: number, text: string): Node {
  return {
    type: "strong",
    position: { start: { offset } },
    children: [{ type: "text", value: text }],
  };
}

describe("remarkUnderline", () => {
  it("tags __text__ (underscore-bold) with hName='u'", () => {
    const node = strongAt(0, "text");
    const tree: Node = { type: "root", children: [node] };
    run(tree, "__text__");
    expect(node.data?.hName).toBe("u");
  });

  it("does not tag **text** (star-bold) with hName", () => {
    const node = strongAt(0, "text");
    const tree: Node = { type: "root", children: [node] };
    run(tree, "**text**");
    expect((node as Record<string, unknown>).data).toBeUndefined();
  });

  it("uses position offset to distinguish when both styles appear", () => {
    const starNode = strongAt(0, "star");
    const underNode = strongAt(10, "under");
    const tree: Node = { type: "root", children: [starNode, underNode] };
    // source: "**star** __under__"
    //          0       10
    run(tree, "**star** __under__");
    expect((starNode as Record<string, unknown>).data).toBeUndefined();
    expect(underNode.data?.hName).toBe("u");
  });

  it("recurses into nested children", () => {
    const innerStrong = strongAt(5, "inner");
    const tree: Node = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [innerStrong],
        },
      ],
    };
    run(tree, "Hey, __inner__ text");
    expect(innerStrong.data?.hName).toBe("u");
  });

  it("does not tag a strong node with no position info", () => {
    const node: Node = { type: "strong", children: [{ type: "text", value: "no pos" }] };
    const tree: Node = { type: "root", children: [node] };
    run(tree, "__no pos__");
    expect((node as Record<string, unknown>).data).toBeUndefined();
  });
});
