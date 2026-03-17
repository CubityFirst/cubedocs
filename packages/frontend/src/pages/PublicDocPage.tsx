import { useState, useEffect, useMemo, isValidElement } from "react";
import { useParams, useNavigate, NavLink } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCallouts } from "@/lib/remark-callouts";
import { remarkImageAttrs } from "@/lib/remark-image-attrs";
import { Callout, type CalloutType } from "@/components/Callout";
import { MarkdownCode } from "@/components/CodeBlock";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, Folder, ChevronLeft, ChevronRight, Search, X, Image, FileCode, FileArchive, File, Download, ImageOff } from "lucide-react";

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
  for (const line of content.split("\n")) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const text = match[2].trim();
      headings.push({ level: match[1].length, text, id: toId(text) });
    }
  }
  return headings;
}

const remarkPlugins = [remarkGfm, remarkCallouts, remarkImageAttrs];

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
            There was meant to be an image here, but it either doesn&apos;t exist, or you do not have permission to view it. Click here to find out more.
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
  folder_id: string | null;
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
  doc: { id: string; title: string; content: string; showLastUpdated: boolean; updatedAt: string };
  sitePublished: boolean;
  project: { id: string; name: string };
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
  if (mimeType === "application/json" || mimeType.startsWith("text/")) return <FileCode className={className} />;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip") || mimeType.includes("archive")) return <FileArchive className={className} />;
  return <File className={className} />;
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
  const childFolders = folders
    .filter(f => f.parent_id === parentId)
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
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{doc.title}</span>
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
  const navigate = useNavigate();
  const [data, setData] = useState<PublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<NavFile | null>(null);
  const [hasToken, setHasToken] = useState(false);

  const markdownComponents = useMemo(() => ({
    ...baseMarkdownComponents,
    img: makePublicImage(projectId ?? ""),
  }), [projectId]);

  useEffect(() => {
    setHasToken(!!getToken());
  }, []);

  useEffect(() => {
    if (!projectId) return;

    // If no docId, fetch the site to get the first doc and redirect
    if (!docId) {
      fetch(`/api/public/projects/${projectId}`)
        .then(r => r.json())
        .then((json: { ok: boolean; data?: { id: string; docs: NavDoc[] } }) => {
          if (json.ok && json.data && json.data.docs.length > 0) {
            navigate(`/s/${projectId}/${json.data.docs[0].id}`, { replace: true });
          } else {
            setNotFound(true);
            setLoading(false);
          }
        })
        .catch(() => { setNotFound(true); setLoading(false); });
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
  }, [projectId, docId, navigate]);

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
    ? (data.docs ?? []).filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar — only shown when the entire site is published */}
      {showNav && (
        <aside className="flex w-64 shrink-0 flex-col border-r border-border">
          <div className="flex h-14 items-center gap-2 px-4">
            {hasToken && (
              <button
                onClick={() => navigate(`/projects/${projectId}`)}
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
          <div className="px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search…"
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
                      to={`/s/${data.project.id}/${doc.id}`}
                      onClick={() => setSelectedFile(null)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                          isActive ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80"
                        }`
                      }
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{doc.title}</span>
                    </NavLink>
                  ))
                )
              ) : (
                <NavTree
                  projectId={data.project.id}
                  folders={data.folders ?? []}
                  docs={data.docs!}
                  files={data.files ?? []}
                  onFileClick={setSelectedFile}
                  onDocClick={() => setSelectedFile(null)}
                  selectedFileId={selectedFile?.id ?? null}
                />
              )}
            </nav>
          </ScrollArea>
        </aside>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!showNav && (
          <header className="flex h-14 items-center border-b border-border px-6 gap-2">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <h1 className="text-sm font-medium text-muted-foreground truncate">{data.project.name}</h1>
          </header>
        )}
        <ScrollArea className="flex-1">
          {selectedFile ? (
            <PublicFileView file={selectedFile} projectId={projectId ?? ""} />
          ) : (
            <div className="flex min-h-full">
              {/* Article */}
              <div className="flex-1 min-w-0 px-6 py-10">
                <div className="mx-auto max-w-3xl">
                  <article className="prose prose-neutral dark:prose-invert max-w-none">
                    <h1>{data.doc.title}</h1>
                    {data.doc.showLastUpdated && (
                      <p className="not-prose -mt-2 mb-6 text-sm text-muted-foreground">
                        Last updated {new Date(data.doc.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    )}
                    {data.doc.content.trim() ? (
                      <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
                        {data.doc.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="not-prose text-sm italic text-muted-foreground/60">
                        This page has no content yet.
                      </p>
                    )}
                  </article>
                </div>
              </div>

              {/* Outline */}
              {headings.length > 0 && (
                <aside className="hidden xl:block w-56 shrink-0 py-10 pr-6">
                  <div className="sticky top-6">
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
                  </div>
                </aside>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
