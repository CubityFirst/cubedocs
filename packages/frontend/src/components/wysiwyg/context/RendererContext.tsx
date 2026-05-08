import { createContext, useContext, type ReactNode } from "react";
import { Facet } from "@codemirror/state";

export interface DocInfo {
  id: string;
  title: string;
  display_title?: string | null;
  folder_id?: string | null;
}

export interface FolderInfo {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface RendererCtx {
  projectId?: string;
  isPublic: boolean;
  currentDocId?: string;
  hideFrontmatter?: boolean;
  /** When false, decorations are always applied (Reading mode). Default true (Editing mode). */
  revealOnCursor?: boolean;
  docs?: DocInfo[];
  folders?: FolderInfo[];
  buildUrl?: (docId: string, anchor?: string) => string;
}

const defaultCtx: RendererCtx = {
  isPublic: false,
  revealOnCursor: true,
};

export const RendererReactContext = createContext<RendererCtx>(defaultCtx);

export function useRendererCtx(): RendererCtx {
  return useContext(RendererReactContext);
}

export function RendererProvider({ value, children }: { value: RendererCtx; children: ReactNode }) {
  return <RendererReactContext.Provider value={value}>{children}</RendererReactContext.Provider>;
}

export const rendererCtxFacet = Facet.define<RendererCtx, RendererCtx>({
  combine: values => values[0] ?? defaultCtx,
});
