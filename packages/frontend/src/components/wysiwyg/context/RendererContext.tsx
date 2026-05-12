import { createContext, useContext } from "react";
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
  /** True when the *viewing* user is an Annex Ink supporter AND has the crit-sparkles preference enabled. Gates the sparkle burst on dice critical successes. */
  showInkCritSparkles?: boolean;
  docs?: DocInfo[];
  folders?: FolderInfo[];
  buildUrl?: (docId: string, anchor?: string) => string;
}

export const defaultRendererCtx: RendererCtx = {
  isPublic: false,
  revealOnCursor: true,
};

export const RendererReactContext = createContext<RendererCtx>(defaultRendererCtx);

export function useRendererCtx(): RendererCtx {
  return useContext(RendererReactContext);
}

export const rendererCtxFacet = Facet.define<RendererCtx, RendererCtx>({
  combine: values => values[0] ?? defaultRendererCtx,
});
