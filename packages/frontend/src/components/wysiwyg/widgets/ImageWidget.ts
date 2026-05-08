import { createElement, type ReactElement } from "react";
import { WidgetType } from "@codemirror/view";
import { ReactWidget } from "./ReactWidget";
import { AuthenticatedImage } from "@/components/AuthenticatedImage";
import { useRendererCtx } from "../context/RendererContext";

interface Props {
  src: string;
  alt: string;
  style?: string;
  inline: boolean;
}

function ImageInner({ src, alt, style, inline }: Props) {
  const ctx = useRendererCtx();
  const styleObj = style ? parseStyle(style) : undefined;
  const cls = inline ? "cm-wysiwyg-image cm-wysiwyg-image--inline" : "cm-wysiwyg-image cm-wysiwyg-image--block";
  return createElement(AuthenticatedImage, {
    src,
    alt,
    projectId: ctx.projectId,
    isPublic: ctx.isPublic,
    style: styleObj,
    className: cls,
  });
}

function parseStyle(s: string): React.CSSProperties {
  const out: React.CSSProperties = {};
  for (const decl of s.split(";")) {
    const [k, v] = decl.split(":").map(p => p.trim());
    if (!k || !v) continue;
    if (k === "width") out.width = v;
    else if (k === "height") out.height = v;
  }
  return out;
}

export class ImageWidget extends ReactWidget {
  constructor(private readonly props: Props) {
    super();
    this.tag = props.inline ? "span" : "div";
  }

  protected render(): ReactElement {
    return createElement(ImageInner, this.props);
  }

  protected revealOnClick(): boolean {
    return true;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageWidget &&
      other.props.src === this.props.src &&
      other.props.alt === this.props.alt &&
      other.props.style === this.props.style &&
      other.props.inline === this.props.inline
    );
  }
}
