import { createElement, type ReactElement } from "react";
import { WidgetType } from "@codemirror/view";
import { ReactWidget } from "./ReactWidget";
import { AudioEmbed } from "@/components/AudioEmbed";
import { useRendererCtx } from "../context/RendererContext";
import type { AudioSize } from "@/lib/audioUrl";

interface Props {
  src: string;
  alt: string;
  size: AudioSize;
  style?: string;
  inline: boolean;
}

function AudioInner({ src, alt, size, style }: Props) {
  const ctx = useRendererCtx();
  const styleObj = style ? parseStyle(style) : undefined;
  return createElement(AudioEmbed, {
    src,
    alt,
    size,
    projectId: ctx.projectId,
    isPublic: ctx.isPublic,
    style: styleObj,
  });
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

export class AudioWidget extends ReactWidget {
  constructor(private readonly props: Props) {
    super();
    this.tag = props.inline ? "span" : "div";
  }

  protected render(): ReactElement {
    return createElement(AudioInner, this.props);
  }

  protected revealOnClick(): boolean {
    // Audio widgets host interactive controls (play/pause, the native audio
    // element). Letting CM steal pointerdown to move the cursor + focus would
    // race with those clicks, so we keep events inside the widget like the
    // dice and wikilink widgets do — reveal markdown by clicking the text
    // around it instead.
    return false;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof AudioWidget &&
      other.props.src === this.props.src &&
      other.props.alt === this.props.alt &&
      other.props.size === this.props.size &&
      other.props.style === this.props.style &&
      other.props.inline === this.props.inline
    );
  }
}
