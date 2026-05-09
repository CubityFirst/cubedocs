import type { MarkdownConfig } from "@lezer/markdown";

const PERCENT = 37; // %
const NEWLINE = 10; // \n

export const Comment: MarkdownConfig = {
  defineNodes: ["MdComment", "MdCommentMark"],
  parseInline: [
    {
      name: "MdComment",
      before: "Emphasis",
      parse(cx, next, pos) {
        if (next !== PERCENT) return -1;
        if (cx.char(pos + 1) !== PERCENT) return -1;
        let end = pos + 2;
        while (end < cx.end - 1) {
          const ch = cx.char(end);
          if (ch === PERCENT && cx.char(end + 1) === PERCENT) {
            const open = cx.elt("MdCommentMark", pos, pos + 2);
            const close = cx.elt("MdCommentMark", end, end + 2);
            return cx.addElement(cx.elt("MdComment", pos, end + 2, [open, close]));
          }
          if (ch === NEWLINE) return -1;
          end++;
        }
        return -1;
      },
    },
  ],
};
