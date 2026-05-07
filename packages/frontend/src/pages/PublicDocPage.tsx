import { useState, useEffect, useCallback, useMemo, isValidElement } from "react";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { SearchPalette } from "@/components/SearchPalette";
import { useParams, useNavigate, NavLink } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { remarkCallouts } from "@/lib/remark-callouts";
import { remarkImageAttrs } from "@/lib/remark-image-attrs";
import { remarkWikilinks, wikilinkUrlTransform } from "@/lib/remark-wikilinks";
import { makeDocLink } from "@/components/DocLink";
import { parseFrontmatter } from "@/lib/frontmatter";
import { Callout, type CalloutType } from "@/components/Callout";
import { MarkdownCode } from "@/components/CodeBlock";
import { GraphView, type GraphData } from "@/components/GraphView";
import { LinkedDocsPanel } from "@/components/LinkedDocsPanel";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, Folder, House, ChevronLeft, ChevronRight, Search, X, Image, FileCode, FileArchive, File, Music, Download, ImageOff, Network } from "lucide-react";

function toId(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

function childrenToText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  if (isValidElement(children)) return childrenToText((children.props as { children?: React.ReactNode }).children);
  return "";
}

function makeHeading(Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function HeadingWithId({ children, node: _node, ...props }: React.ComponentPropsWithoutRef<"h1"> & { node?: unknown }) {
    const id = toId(childrenToText(children));
    return <Tag id={id} {...props}>{children}</Tag>;
  };
}

interface Heading { level: number; text: string; id: string }

function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const lines = content.split("\n");
  let inFrontmatter = false;
  let frontmatterDone = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.trimEnd() === "---") { inFrontmatter = true; continue; }
    if (inFrontmatter && !frontmatterDone) {
      if (line.trimEnd() === "---") { inFrontmatter = false; frontmatterDone = true; }
      continue;
    }
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const text = match[2].trim();
      headings.push({ level: match[1].length, text, id: toId(text) });
    }
  }
  return headings;
}

const remarkPlugins = [remarkFrontmatter, remarkWikilinks, remarkGfm, remarkCallouts, remarkImageAttrs];

function makePublicImage(projectId: string) {
  return function PublicImage({ src, alt, ...props }: React.ComponentPropsWithoutRef<"img">) {
    const [failed, setFailed] = useState(false);
    let publicSrc = src;
    if (src?.startsWith("/api/files/")) {
      publicSrc = src.replace("/api/files/", "/api/public/files/") + `?projectId=${projectId}`;
    } else if (src?.startsWith("/api/public/files/") && !src.includes("projectId=")) {
      publicSrc = src + `?projectId=${projectId}`;
    }
    if (failed) {
      return (
        <a href="https://docs.cubityfir.st/s/e6d11927-cc6b-48d1-8577-af8b08019d61/258a2eb4-edac-4c86-91aa-afdc46c29c00" target="_blank" rel="noopener noreferrer" aria-label="Image unavailable - learn more">
          <Badge variant="destructive" className="inline-flex items-center gap-1.5 font-normal cursor-pointer" title={alt}>
            <ImageOff className="h-3.5 w-3.5 shrink-0" />
            Image unavailable: Learn more about missing images and permissions.
          </Badge>
        </a>
      );
    }
    return <img src={publicSrc} alt={alt} onError={() => setFailed(true)} {...props} />;
  };
}

const baseMarkdownComponents = {
  blockquote({ children, node, ...props }: React.ComponentPropsWithoutRef<"blockquote"> & { node?: { properties?: Record<string, unknown> } }) {
    const p = node?.properties;
    const calloutType = p?.["data-callout"] as CalloutType | undefined;
    if (calloutType) {
      return (
        <Callout
          type={calloutType}
          title={p?.["data-callout-title"] as string | undefined}
          fold={p?.["data-callout-fold"] as string | undefined}
        >
          {children}
        </Callout>
      );
    }
    return <blockquote {...props}>{children}</blockquote>;
  },
  h1: makeHeading("h1"),
  h2: makeHeading("h2"),
  h3: makeHeading("h3"),
  h4: makeHeading("h4"),
  h5: makeHeading("h5"),
  h6: makeHeading("h6"),
  code: MarkdownCode,
};

interface NavDoc {
  id: string;
  title: string;
  display_title?: string | null;
  folder_id: string | null;
  sidebar_position?: number | null;
  is_home?: number;
}

interface NavFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

interface NavFile {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  folder_id: string | null;
}

interface PublicData {
  doc: { id: string; title: string; display_title: string | null; hide_title: boolean | null; content: string; showHeading: boolean; showLastUpdated: boolean; updatedAt: string };
  sitePublished: boolean;
  project: { id: string; name: string; vanity_slug: string | null; home_doc_id: string | null; graph_enabled: number; published_graph_enabled: number };
  docs: NavDoc[] | null;
  folders: NavFolder[] | null;
  files: NavFile[] | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <Image className={className} />;
  if (mimeType.startsWith("audio/")) return <Music className={className} />;
  if (mimeType === "application/json" || mimeType.startsWith("text/")) return <FileCode className={className} />;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip") || mimeType.includes("archive")) return <FileArchive className={className} />;
  return <File className={className} />;
}

function flattenDocs(folders: NavFolder[], docs: NavDoc[], parentId: string | null = null): NavDoc[] {
  const childFolders = folders.filter(f => f.parent_id === parentId);
  const childDocs = docs.filter(d => d.folder_id === parentId);
  const result: NavDoc[] = [];
  for (const folder of childFolders) {
    result.push(...flattenDocs(folders, docs, folder.id));
  }
  result.push(...childDocs);
  return result;
}

function folderHasItems(folderId: string, folders: NavFolder[], docs: NavDoc[], files: NavFile[]): boolean {
  if (docs.some(d => d.folder_id === folderId)) return true;
  if (files.some(f => f.folder_id === folderId)) return true;
  return folders
    .filter(f => f.parent_id === folderId)
    .some(child => folderHasItems(child.id, folders, docs, files));
}

// When a folder or doc is the last child, we erase the parent's border-l below the
// item's midpoint so the vertical line terminates rather than running past the last item.
// For folders, the midpoint is top-4 (16px = half of the 32px button row height).
// For docs, it's top-1/2 (50% of the single-row element height).
const FOLDER_ERASE = "after:content-[''] after:absolute after:left-[-1px] after:top-4 after:bottom-0 after:w-[2px] after:bg-background";
const DOC_ERASE    = "after:content-[''] after:absolute after:left-[-1px] after:top-1/2 after:bottom-0 after:w-[2px] after:bg-background";

function FolderNode({
  folder,
  projectId,
  folders,
  docs,
  files,
  depth,
  isLast,
  onFileClick,
  onDocClick,
  selectedFileId,
}: {
  folder: NavFolder;
  projectId: string;
  folders: NavFolder[];
  docs: NavDoc[];
  files: NavFile[];
  depth: number;
  isLast: boolean;
  onFileClick: (file: NavFile) => void;
  onDocClick: () => void;
  selectedFileId: string | null;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`relative ${isLast && depth > 0 ? FOLDER_ERASE : ""}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`relative w-full flex items-center gap-1.5 rounded-md py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground ${depth > 0 ? "pl-3 pr-2" : "px-2"}`}
      >
        {depth > 0 && (
          <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-px w-3 bg-border" />
        )}
        <ChevronRight className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`} />
        <Folder className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium">{folder.name}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border">
          <NavTree projectId={projectId} folders={folders} docs={docs} files={files} parentId={folder.id} depth={depth + 1} onFileClick={onFileClick} onDocClick={onDocClick} selectedFileId={selectedFileId} />
        </div>
      )}
    </div>
  );
}

function NavTree({
  projectId,
  folders,
  docs,
  files,
  parentId = null,
  depth = 0,
  onFileClick,
  onDocClick,
  selectedFileId,
}: {
  projectId: string;
  folders: NavFolder[];
  docs: NavDoc[];
  files: NavFile[];
  parentId?: string | null;
  depth?: number;
  onFileClick: (file: NavFile) => void;
  onDocClick: () => void;
  selectedFileId: string | null;
}) {
  const HIDDEN_FOLDER_NAMES = ["hidden", "doc_assets"];
  const childFolders = folders
    .filter(f => f.parent_id === parentId)
    .filter(f => !HIDDEN_FOLDER_NAMES.includes(f.name.toLowerCase()))
    .filter(f => folderHasItems(f.id, folders, docs, files));
  const childDocs = docs.filter(d => d.folder_id === parentId);
  const childFiles = files.filter(f => f.folder_id === parentId);
  const hasLeafItems = childDocs.length > 0 || childFiles.length > 0;

  return (
    <>
      {childFolders.map((folder, i) => {
        const isLast = !hasLeafItems && i === childFolders.length - 1;
        return (
          <FolderNode
            key={folder.id}
            folder={folder}
            projectId={projectId}
            folders={folders}
            docs={docs}
            files={files}
            depth={depth}
            isLast={isLast}
            onFileClick={onFileClick}
            onDocClick={onDocClick}
            selectedFileId={selectedFileId}
          />
        );
      })}
      {childDocs.map((doc, i) => {
        const isLast = childFiles.length === 0 && i === childDocs.length - 1;
        return (
          <NavLink
            key={doc.id}
            to={`/s/${projectId}/${doc.id}`}
            onClick={onDocClick}
            className={({ isActive }) =>
              `relative flex items-center gap-2 rounded-md py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground pr-2 ${
                depth > 0 ? "pl-3" : "pl-2"
              } ${isActive && !selectedFileId ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80"} ${isLast && depth > 0 ? DOC_ERASE : ""}`
            }
          >
            {depth > 0 && (
              <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-px w-3 bg-border" />
            )}
            {doc.is_home === 1
              ? <House className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            }
            <span className="truncate">{doc.display_title ?? doc.title}</span>
          </NavLink>
        );
      })}
      {childFiles.map((file, i) => {
        const isLast = i === childFiles.length - 1;
        return (
          <button
            key={file.id}
            onClick={() => onFileClick(file)}
            className={`relative w-full flex items-center gap-2 rounded-md py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground pr-2 ${
              depth > 0 ? "pl-3" : "pl-2"
            } ${selectedFileId === file.id ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80"} ${isLast && depth > 0 ? DOC_ERASE : ""}`}
          >
            {depth > 0 && (
              <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-px w-3 bg-border" />
            )}
            <FileTypeIcon mimeType={file.mime_type} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name}</span>
          </button>
        );
      })}
    </>
  );
}

function PublicFileView({ file, projectId }: { file: NavFile; projectId: string }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/public/files/${file.id}/content?projectId=${projectId}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-muted">
          <FileTypeIcon mimeType={file.mime_type} className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{file.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{file.mime_type}</p>
        </div>
      </div>

      <Separator className="my-6" />

      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Size</dt>
        <dd>{formatBytes(file.size)}</dd>
      </dl>

      {file.mime_type.startsWith("image/") && (
        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-muted/30">
          <img
            src={`/api/public/files/${file.id}/content?projectId=${projectId}`}
            alt={file.name}
            className="max-h-[60vh] w-full object-contain"
          />
        </div>
      )}

      {file.mime_type.startsWith("audio/") && (
        <div className="mt-8 rounded-xl border border-border bg-muted/30 p-4">
          <audio controls src={`/api/public/files/${file.id}/content?projectId=${projectId}`} className="w-full" />
        </div>
      )}

      <div className="mt-8">
        <Button onClick={handleDownload} disabled={downloading} className="gap-2">
          <Download className="h-4 w-4" />
          {downloading ? "Downloading…" : "Download"}
        </Button>
      </div>
    </div>
  );
}

export function PublicDocPage() {
  const { projectId, docId } = useParams<{ projectId: string; docId: string }>();
  const isGraph = docId === "graph";
  const navigate = useNavigate();
  const [data, setData] = useState<PublicData | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<NavFile | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [searchOpen, setSearchOpen] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const openSearch = useCallback(() => { if (data?.sitePublished && projectId) setSearchOpen(true); }, [data?.sitePublished, projectId]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  useSwipeGesture({
    onSwipeLeft: () => setSidebarOpen(false),
    onSwipeRight: () => setSidebarOpen(true),
  });

  const markdownComponents = useMemo(() => ({
    ...baseMarkdownComponents,
    img: makePublicImage(projectId ?? ""),
    a: makeDocLink({
      docs: data?.docs ?? [],
      folders: data?.folders ?? [],
      buildUrl: (docId, anchor) => {
        const slug = data?.project.vanity_slug ?? projectId ?? "";
        return `/s/${slug}/${docId}${anchor ? "#" + anchor : ""}`;
      },
    }),
  }), [projectId, data]);

  useEffect(() => {
    setHasToken(!!getToken());
  }, []);

  useEffect(() => {
    if (!projectId) return;

    // If no docId, fetch the site to get the first doc and redirect
    if (!docId) {
      fetch(`/api/public/projects/${projectId}`)
        .then(r => r.json())
        .then((json: { ok: boolean; data?: { id: string; vanity_slug?: string | null; home_doc_id?: string | null; docs: NavDoc[] } }) => {
          if (json.ok && json.data && json.data.docs.length > 0) {
            const slug = json.data.vanity_slug ?? projectId;
            const homeDoc = json.data.home_doc_id ? json.data.docs.find(d => d.id === json.data!.home_doc_id) : null;
            const target = homeDoc ?? json.data.docs[0];
            navigate(`/s/${slug}/${target.id}`, { replace: true });
          } else {
            setNotFound(true);
            setLoading(false);
          }
        })
        .catch(() => { setNotFound(true); setLoading(false); });
      return;
    }

    if (isGraph) {
      if (!data) setLoading(true);
      setNotFound(false);
      setSelectedFile(null);
      Promise.all([
        fetch(`/api/public/projects/${projectId}`).then(r => r.json() as Promise<{ ok: boolean; data?: { id: string; name: string; vanity_slug: string | null; home_doc_id: string | null; graph_enabled: number; published_graph_enabled: number; docs: NavDoc[]; folders: NavFolder[]; files: NavFile[] } }>),
        fetch(`/api/public/projects/${projectId}/graph`).then(r => r.json() as Promise<{ ok: boolean; data?: GraphData }>),
      ])
        .then(([projJson, graphJson]) => {
          if (projJson.ok && projJson.data) {
            const p = projJson.data;
            if (p.published_graph_enabled !== 1) {
              setNotFound(true);
              return;
            }
            setData({
              doc: { id: "", title: "", display_title: null, hide_title: null, content: "", showHeading: false, showLastUpdated: false, updatedAt: "" },
              sitePublished: true,
              project: { id: p.id, name: p.name, vanity_slug: p.vanity_slug, home_doc_id: p.home_doc_id, graph_enabled: p.graph_enabled, published_graph_enabled: p.published_graph_enabled },
              docs: p.docs ?? [],
              folders: p.folders ?? [],
              files: p.files ?? [],
            });
          } else {
            setNotFound(true);
          }
          setGraphData(graphJson.ok && graphJson.data ? graphJson.data : { nodes: [], edges: [] });
        })
        .catch(() => setNotFound(true))
        .finally(() => setLoading(false));
      return;
    }

    if (!data) setLoading(true);
    setNotFound(false);
    setSelectedFile(null);
    fetch(`/api/public/docs/${projectId}/${docId}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json() as Promise<{ ok: boolean; data?: PublicData }>;
      })
      .then(json => {
        if (json && json.ok && json.data) setData(json.data);
        else if (json) setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [projectId, docId, isGraph, navigate]);

  // Redirect raw UUID to vanity slug once we know it
  useEffect(() => {
    if (!data || !docId) return;
    const slug = data.project.vanity_slug;
    if (slug && projectId !== slug) {
      navigate(`/s/${slug}/${docId}`, { replace: true });
    }
  }, [data, projectId, docId, navigate]);

  // Fetch graph once when viewing a doc on a project with the published graph enabled
  useEffect(() => {
    if (isGraph) return;
    if (!projectId) return;
    if (!data || data.project.published_graph_enabled !== 1) return;
    if (graphData) return;
    fetch(`/api/public/projects/${projectId}/graph`)
      .then(r => r.json() as Promise<{ ok: boolean; data?: GraphData }>)
      .then(json => { if (json.ok && json.data) setGraphData(json.data); })
      .catch(() => { /* non-fatal */ });
  }, [isGraph, projectId, data, graphData]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold">Not found</p>
          <p className="mt-1 text-sm text-muted-foreground">No published document exists at this location.</p>
        </div>
      </div>
    );
  }

  const headings = extractHeadings(data.doc.content);
  const showNav = data.sitePublished && data.docs && (data.docs.length > 0 || (data.files && data.files.length > 0));

  const filteredDocs = searchQuery.trim()
    ? (data.docs ?? []).filter(d => (d.display_title ?? d.title).toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Mobile sidebar backdrop */}
      {showNav && sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      {/* Sidebar — only shown when the entire site is published */}
      {showNav && (
        <div className={cn(
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200",
          "md:relative md:inset-auto md:z-auto md:transition-none md:shrink-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
        <aside className={cn("flex h-full flex-col border-r border-border overflow-hidden w-64 md:transition-[width] md:duration-200", !sidebarOpen && "md:w-0")}>
          <div className="flex h-14 items-center gap-2 px-4">
            {hasToken && (
              <button
                onClick={() => navigate(`/projects/${data.project.id}`)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Back to project"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">{data.project.name}</span>
          </div>
          <Separator />
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={`Filter titles… (${/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl+K"} for full search)`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-7 h-8 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {data.project.published_graph_enabled === 1 && (
              <NavLink
                to={`/s/${data.project.vanity_slug ?? data.project.id}/graph`}
                title="Graph"
                className={({ isActive }) =>
                  `shrink-0 flex items-center justify-center rounded-md h-8 w-8 transition-colors hover:bg-accent hover:text-accent-foreground ${
                    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  }`
                }
              >
                <Network className="h-3.5 w-3.5" />
              </NavLink>
            )}
          </div>
          <ScrollArea className="flex-1 px-2 py-1">
            <nav className="flex flex-col gap-0.5">
              {filteredDocs !== null ? (
                filteredDocs.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">No results</p>
                ) : (
                  filteredDocs.map(doc => (
                    <NavLink
                      key={doc.id}
                      to={`/s/${data.project.vanity_slug ?? data.project.id}/${doc.id}`}
                      onClick={() => setSelectedFile(null)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                          isActive ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80"
                        }`
                      }
                    >
                      {doc.is_home === 1
                        ? <House className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      }
                      <span className="truncate">{doc.display_title ?? doc.title}</span>
                    </NavLink>
                  ))
                )
              ) : (() => {
                const homeDoc = data.docs!.find(d => d.is_home === 1);
                const restDocs = homeDoc ? data.docs!.filter(d => d.id !== homeDoc.id) : data.docs!;
                const slug = data.project.vanity_slug ?? data.project.id;
                return (
                  <>
                    {homeDoc && (
                      <NavLink
                        to={`/s/${slug}/${homeDoc.id}`}
                        onClick={() => setSelectedFile(null)}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                            isActive ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80"
                          }`
                        }
                      >
                        <House className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{homeDoc.display_title ?? homeDoc.title}</span>
                      </NavLink>
                    )}
                    <NavTree
                      projectId={slug}
                      folders={data.folders ?? []}
                      docs={restDocs}
                      files={data.files ?? []}
                      onFileClick={setSelectedFile}
                      onDocClick={() => setSelectedFile(null)}
                      selectedFileId={selectedFile?.id ?? null}
                    />
                  </>
                );
              })()}
            </nav>
          </ScrollArea>
        </aside>
        <button
          onClick={() => setSidebarOpen(v => !v)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="absolute top-1/2 -translate-y-1/2 -right-3 z-10 flex h-10 w-3 items-center justify-center rounded-r-full border border-l-0 border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ChevronLeft className={cn("h-2.5 w-2.5 transition-transform duration-200", !sidebarOpen && "rotate-180")} />
        </button>
        </div>
      )}

      {/* Main content */}
      <div className={cn("flex flex-1 flex-col overflow-hidden transition-transform duration-200", showNav && sidebarOpen && "translate-x-64 md:translate-x-0")}>
        {!showNav && (
          <header className="flex h-14 items-center border-b border-border px-6 gap-2">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <h1 className="text-sm font-medium text-muted-foreground truncate">{data.project.name}</h1>
          </header>
        )}
        {isGraph ? (
          <div className="flex-1 min-h-0">
            {graphData && graphData.nodes.length > 0 ? (
              <GraphView
                data={graphData}
                onNodeClick={id => navigate(`/s/${data.project.vanity_slug ?? data.project.id}/${id}`)}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {graphData ? "No documents to graph yet." : "Loading graph…"}
                </p>
              </div>
            )}
          </div>
        ) : (
        <ScrollArea className="flex-1">
          {selectedFile ? (
            <PublicFileView file={selectedFile} projectId={projectId ?? ""} />
          ) : (
            <div className="flex min-h-full">
              {/* Article */}
              <div className="flex-1 min-w-0 px-6 py-10">
                <div className="mx-auto max-w-3xl">
                  <article className="prose prose-neutral dark:prose-invert max-w-none">
                    {(() => {
                      const fm = parseFrontmatter(data.doc.content);
                      const showHeading = fm.hide_title !== undefined ? !fm.hide_title : data.doc.showHeading;
                      const headingTitle = fm.title ?? data.doc.title;
                      return showHeading && <h1>{headingTitle}</h1>;
                    })()}
                    {data.doc.showLastUpdated && (
                      <p className="not-prose -mt-2 mb-6 text-sm text-muted-foreground">
                        Last updated {new Date(data.doc.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    )}
                    {data.doc.content.trim() ? (
                      <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents} urlTransform={wikilinkUrlTransform}>
                        {data.doc.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="not-prose text-sm italic text-muted-foreground/60">
                        This page has no content yet.
                      </p>
                    )}
                  </article>

                  {(() => {
                    if (!data.docs || data.docs.length < 2) return null;
                    const slug = data.project.vanity_slug ?? data.project.id;
                    const homeDoc = data.docs.find(d => d.is_home === 1);
                    const restDocs = homeDoc ? data.docs.filter(d => d.id !== homeDoc.id) : data.docs;
                    const orderedDocs: NavDoc[] = [
                      ...(homeDoc ? [homeDoc] : []),
                      ...flattenDocs(data.folders ?? [], restDocs),
                    ];
                    const idx = orderedDocs.findIndex(d => d.id === docId);
                    if (idx === -1) return null;
                    const prevDoc = idx > 0 ? orderedDocs[idx - 1] : null;
                    const nextDoc = idx < orderedDocs.length - 1 ? orderedDocs[idx + 1] : null;
                    return (
                      <div className="not-prose mt-12 flex justify-between gap-4">
                        {prevDoc ? (
                          <button
                            onClick={() => navigate(`/s/${slug}/${prevDoc.id}`)}
                            className="group flex flex-col gap-0.5 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent w-[calc(50%-8px)]"
                          >
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <ChevronLeft className="h-3.5 w-3.5" /> Previous
                            </span>
                            <span className="text-sm font-medium text-foreground truncate">{prevDoc.display_title ?? prevDoc.title}</span>
                          </button>
                        ) : <div />}
                        {nextDoc ? (
                          <button
                            onClick={() => navigate(`/s/${slug}/${nextDoc.id}`)}
                            className="group flex flex-col gap-0.5 rounded-lg border border-border bg-card p-4 text-right transition-colors hover:bg-accent w-[calc(50%-8px)] items-end ml-auto"
                          >
                            <span className="flex items-center justify-end gap-1.5 text-xs font-medium text-muted-foreground">
                              Next <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-sm font-medium text-foreground truncate">{nextDoc.display_title ?? nextDoc.title}</span>
                          </button>
                        ) : <div />}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Right rail: linked-docs preview + outline */}
              {(() => {
                const showLinkedDocs = data.project.published_graph_enabled === 1 && !!docId && !!graphData;
                if (!showLinkedDocs && headings.length === 0) return null;
                const slug = data.project.vanity_slug ?? data.project.id;
                return (
                  <aside className="hidden xl:block w-56 shrink-0 py-10 pr-6">
                    <div className="sticky top-6">
                      {showLinkedDocs && docId && graphData && (
                        <LinkedDocsPanel
                          data={graphData}
                          currentDocId={docId}
                          onExpand={() => setGraphExpanded(true)}
                          onNodeClick={id => navigate(`/s/${slug}/${id}`)}
                        />
                      )}
                      {headings.length > 0 && (
                        <>
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Outline
                          </p>
                          <ScrollArea className="max-h-[calc(100vh-8rem)]">
                            <nav className="flex flex-col gap-0.5">
                              {headings.map((h, i) => (
                                <button
                                  key={i}
                                  onClick={() => document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" })}
                                  style={{ paddingLeft: `${(h.level - 1) * 0.75}rem` }}
                                  className="truncate rounded px-2 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  {h.text}
                                </button>
                              ))}
                            </nav>
                          </ScrollArea>
                        </>
                      )}
                    </div>
                  </aside>
                );
              })()}
            </div>
          )}
        </ScrollArea>
        )}
      </div>
      {data?.sitePublished && projectId && (
        <SearchPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          projectId={projectId}
          isPublic
        />
      )}
      <Dialog open={graphExpanded} onOpenChange={setGraphExpanded}>
        <DialogContent className="max-w-[90vw] w-[90vw] h-[85vh] p-0 overflow-hidden">
          <div className="h-full w-full">
            {graphData && data && graphData.nodes.length > 0 && (
              <GraphView
                data={graphData}
                onNodeClick={id => {
                  setGraphExpanded(false);
                  const slug = data.project.vanity_slug ?? data.project.id;
                  navigate(`/s/${slug}/${id}`);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
