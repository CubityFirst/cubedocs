import { useState, useEffect, isValidElement } from "react";
import { useParams, useNavigate, NavLink } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCallouts } from "@/lib/remark-callouts";
import { Callout, type CalloutType } from "@/components/Callout";
import { MarkdownCode } from "@/components/CodeBlock";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { BookOpen, FileText, Folder } from "lucide-react";

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

const remarkPlugins = [remarkGfm, remarkCallouts];

const markdownComponents = {
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

interface PublicData {
  doc: { id: string; title: string; content: string };
  sitePublished: boolean;
  project: { id: string; name: string };
  docs: NavDoc[] | null;
  folders: NavFolder[] | null;
}

function NavTree({
  projectId,
  folders,
  docs,
  parentId = null,
  depth = 0,
}: {
  projectId: string;
  folders: NavFolder[];
  docs: NavDoc[];
  parentId?: string | null;
  depth?: number;
}) {
  const childFolders = folders.filter(f => f.parent_id === parentId);
  const childDocs = docs.filter(d => d.folder_id === parentId);

  return (
    <>
      {childFolders.map(folder => (
        <div key={folder.id}>
          <div
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground"
            style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
          >
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium">{folder.name}</span>
          </div>
          <NavTree projectId={projectId} folders={folders} docs={docs} parentId={folder.id} depth={depth + 1} />
        </div>
      ))}
      {childDocs.map(doc => (
        <NavLink
          key={doc.id}
          to={`/s/${projectId}/${doc.id}`}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-md py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
              isActive ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80"
            }`
          }
          style={{ paddingLeft: `${1 + depth * 0.75}rem`, paddingRight: "0.5rem" }}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{doc.title}</span>
        </NavLink>
      ))}
    </>
  );
}

export function PublicDocPage() {
  const { projectId, docId } = useParams<{ projectId: string; docId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

    setLoading(true);
    setNotFound(false);
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
  const showNav = data.sitePublished && data.docs && data.docs.length > 0;

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar — only shown when the entire site is published */}
      {showNav && (
        <aside className="flex w-64 shrink-0 flex-col border-r border-border">
          <div className="flex h-14 items-center gap-2 px-4">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">{data.project.name}</span>
          </div>
          <Separator />
          <ScrollArea className="flex-1 px-2 py-3">
            <nav className="flex flex-col gap-0.5">
              <NavTree
                projectId={data.project.id}
                folders={data.folders ?? []}
                docs={data.docs!}
              />
            </nav>
          </ScrollArea>
        </aside>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b border-border px-6 gap-2">
          {!showNav && <BookOpen className="h-4 w-4 text-primary shrink-0" />}
          <h1 className="text-sm font-medium text-muted-foreground truncate">{data.project.name}</h1>
        </header>
        <ScrollArea className="flex-1">
          <div className="flex min-h-full">
            {/* Article */}
            <div className="flex-1 min-w-0 px-6 py-10">
              <div className="mx-auto max-w-3xl">
                <article className="prose prose-neutral dark:prose-invert max-w-none">
                  <h1>{data.doc.title}</h1>
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
        </ScrollArea>
      </div>
    </div>
  );
}
