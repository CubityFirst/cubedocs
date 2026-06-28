import { lazy, Suspense, createElement, type ReactElement } from "react";
import { WidgetType, type EditorView } from "@codemirror/view";
import { ReactWidget } from "./ReactWidget";
import { useRendererCtx } from "../context/RendererContext";
import { apiFetch } from "@/lib/apiFetch";
import { Spinner } from "@/components/ui/spinner";

// A ```excalidraw fenced block whose body is a drawing file id renders that
// drawing inline as a live, read-only canvas - the same ExcalidrawCanvas used by
// FilePage/PublicDocPage, just embedded in the document flow. Heavy chunk, so
// (like those call sites) it's lazily code-split and never lands in the main
// bundle.
const ExcalidrawCanvas = lazy(() => import("@/components/ExcalidrawCanvas"));

function ExcalidrawEmbedInner({ fileId }: { fileId: string }): ReactElement {
  const ctx = useRendererCtx();
  // Same content-URL + fetcher split the existing mounts use (FilePage.tsx,
  // PublicDocPage.tsx): authed apiFetch in the app, plain fetch for published
  // content (which needs no auth header).
  const contentUrl = ctx.isPublic
    ? `/api/public/files/${fileId}/content?projectId=${ctx.projectId ?? ""}`
    : `/api/files/${fileId}/content`;
  const fetcher = ctx.isPublic
    ? (u: string, init?: RequestInit) => fetch(u, init)
    : (u: string, init?: RequestInit) => apiFetch(u, init);
  // The widget mounts in a detached React root that only carries
  // RendererReactContext (not the app's ThemeProvider), so read the theme off
  // the document element the way PublicDocPage's drawing pane does.
  const theme = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";

  return (
    <div className="cm-excalidraw-embed">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading drawing…
          </div>
        }
      >
        <ExcalidrawCanvas
          contentUrl={contentUrl}
          fetcher={fetcher}
          readOnly
          name="Embedded drawing"
          theme={theme}
        />
      </Suspense>
    </div>
  );
}

export class ExcalidrawEmbedWidget extends ReactWidget {
  protected tag: "div" = "div";

  constructor(private readonly fileId: string) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const el = super.toDOM(view);
    el.classList.add("cm-codefence-widget-root");
    return el;
  }

  protected render(): ReactElement {
    return createElement(ExcalidrawEmbedInner, { fileId: this.fileId });
  }

  // Deliberately NOT revealOnClick: the canvas is interactive, so we let
  // Excalidraw own all pointer events (pan/zoom) rather than have the base
  // widget preventDefault and move the cursor. The author edits/removes the
  // block by arrowing the cursor into its range (keyboard reveal still fires in
  // codeFence.ts) - matching the dice/wikilink interactive-widget convention.

  eq(other: WidgetType): boolean {
    return other instanceof ExcalidrawEmbedWidget && other.fileId === this.fileId;
  }
}
