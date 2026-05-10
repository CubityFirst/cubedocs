import { createElement, type ReactElement, type ReactNode } from "react";
import { WidgetType, type EditorView } from "@codemirror/view";
import { ReactWidget } from "./ReactWidget";
import { AuthenticatedImage } from "@/components/AuthenticatedImage";
import { useRendererCtx } from "../context/RendererContext";
import { parseImageAttrs, styleFromAttrs } from "@/lib/imageAttrs";

type Align = "left" | "center" | "right" | null;

interface ParsedTable {
  headers: string[];
  rows: string[][];
  aligns: Align[];
}

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map(c => c.trim());
}

function parseDelimiter(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return null;
}

function parseTable(source: string): ParsedTable {
  const lines = source.split("\n").map(l => l).filter(l => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [], aligns: [] };
  const headers = splitRow(lines[0]!);
  const aligns = splitRow(lines[1]!).map(parseDelimiter);
  const rows = lines.slice(2).map(splitRow);
  return { headers, rows, aligns };
}

// Minimal inline-markdown renderer for table cells. Handles the common
// constructs: **bold**, *italic*, _italic_, __underline__, ~~strike~~,
// `code`, [text](url). Does NOT recurse into nested formatting.
function renderInline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let pending = "";
  let i = 0;
  let key = 0;

  const flush = () => {
    if (pending) {
      out.push(pending);
      pending = "";
    }
  };

  while (i < text.length) {
    const rest = text.slice(i);
    let m: RegExpMatchArray | null;

    if ((m = rest.match(/^\*\*([^*]+?)\*\*/))) {
      flush();
      out.push(createElement("strong", { key: key++ }, m[1]));
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^__([^_]+?)__/))) {
      flush();
      out.push(createElement("u", { key: key++ }, m[1]));
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^~~([^~]+?)~~/))) {
      flush();
      out.push(createElement("s", { key: key++ }, m[1]));
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^\*([^*\s][^*]*?)\*/))) {
      flush();
      out.push(createElement("em", { key: key++ }, m[1]));
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^_([^_\s][^_]*?)_/))) {
      flush();
      out.push(createElement("em", { key: key++ }, m[1]));
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^`([^`]+?)`/))) {
      flush();
      out.push(createElement("code", { key: key++, className: "cm-inline-code" }, m[1]));
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^!\[([^\]]*)\]\(\s*([^)\s]+?)\s*\)(?:\{([^}\n]*)\})?/))) {
      flush();
      const alt = m[1] ?? "";
      const url = m[2] ?? "";
      const style = m[3] != null ? styleFromAttrs(parseImageAttrs(m[3])) : undefined;
      out.push(createElement(TableImage, { key: key++, src: url, alt, style }));
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^\[([^\]]+?)\]\(([^)\s]+?)\)/))) {
      flush();
      out.push(createElement(
        "a",
        { key: key++, href: m[2], target: "_blank", rel: "noopener noreferrer", className: "cm-link" },
        m[1],
      ));
      i += m[0].length; continue;
    }

    pending += text[i];
    i++;
  }
  flush();
  return out;
}

function parseStyle(s: string): React.CSSProperties {
  const out: React.CSSProperties = {};
  for (const decl of s.split(";")) {
    const [k, v] = decl.split(":").map(p => p.trim());
    if (!k || !v) continue;
    if (k === "width") out.width = v;
    else if (k === "height") out.height = v;
    else if (k === "display") out.display = v;
    else if (k === "margin-left") out.marginLeft = v;
    else if (k === "margin-right") out.marginRight = v;
  }
  return out;
}

function TableImage({ src, alt, style }: { src: string; alt: string; style?: string }) {
  const ctx = useRendererCtx();
  return createElement(AuthenticatedImage, {
    src,
    alt,
    projectId: ctx.projectId,
    isPublic: ctx.isPublic,
    style: style ? parseStyle(style) : undefined,
    className: "cm-wysiwyg-image cm-wysiwyg-image--inline",
  });
}

function TableInner({ source }: { source: string }) {
  const { headers, rows, aligns } = parseTable(source);

  if (headers.length === 0) {
    return createElement("div", { className: "cm-wysiwyg-table-empty" }, source);
  }

  return createElement(
    "table",
    { className: "cm-wysiwyg-table" },
    createElement(
      "thead",
      null,
      createElement(
        "tr",
        null,
        ...headers.map((h, i) =>
          createElement(
            "th",
            { key: i, style: aligns[i] ? { textAlign: aligns[i]! } : undefined },
            renderInline(h),
          ),
        ),
      ),
    ),
    createElement(
      "tbody",
      null,
      ...rows.map((row, ri) =>
        createElement(
          "tr",
          { key: ri },
          ...row.map((cell, ci) =>
            createElement(
              "td",
              { key: ci, style: aligns[ci] ? { textAlign: aligns[ci]! } : undefined },
              renderInline(cell),
            ),
          ),
        ),
      ),
    ),
  );
}

export class TableWidget extends ReactWidget {
  protected tag: "div" = "div";

  constructor(private readonly source: string) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const el = super.toDOM(view);
    el.classList.add("cm-table-widget-root");
    return el;
  }

  protected render(): ReactElement {
    return createElement(TableInner, { source: this.source });
  }

  protected revealOnClick(): boolean {
    return true;
  }

  eq(other: WidgetType): boolean {
    return other instanceof TableWidget && other.source === this.source;
  }
}
