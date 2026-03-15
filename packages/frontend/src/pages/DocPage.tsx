import { useState, useEffect, isValidElement } from "react";
import { useParams, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCallouts } from "@/lib/remark-callouts";
import { Callout, type CalloutType } from "@/components/Callout";
import { MarkdownCode } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pencil, X, Save, Settings, Globe, Lock } from "lucide-react";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

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

interface Doc {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  published_at: string | null;
  show_heading: number;
  myRole?: string;
}

export function DocPage() {
  const { projectId, docId } = useParams<{ projectId: string; docId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { updateDocTitle } = useOutletContext<DocsLayoutContext>();
  const { toast } = useToast();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingPublish, setTogglingPublish] = useState(false);

  useEffect(() => {
    if (!docId) return;
    setLoading(true);
    setEditing(false);
    const token = getToken();
    fetch(`/api/docs/${docId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: Doc }) => {
        if (json.ok && json.data) {
          setDoc(json.data);
          setMyRole(json.data.myRole ?? null);
          if (location.state?.isNew) {
            setTitleDraft(json.data.title);
            setDraft(json.data.content);
            setEditing(true);
            navigate(location.pathname, { replace: true, state: {} });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEditing() {
    if (!doc) return;
    setTitleDraft(doc.title);
    setDraft(doc.content);
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError(null);
  }

  async function handleSave() {
    if (!docId || !doc) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = getToken();
      const res = await fetch(`/api/docs/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: titleDraft, content: draft }),
      });
      const json = await res.json() as { ok: boolean; data?: Doc };
      if (json.ok && json.data) {
        setDoc(json.data);
        updateDocTitle(docId, json.data.title);
        setEditing(false);
      } else {
        setSaveError("Failed to save. Please try again.");
      }
    } catch {
      setSaveError("Could not connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish() {
    if (!docId || !doc) return;
    setTogglingPublish(true);
    const publishedAt = doc.published_at ? null : new Date().toISOString();
    try {
      const token = getToken();
      const res = await fetch(`/api/docs/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publishedAt }),
      });
      const json = await res.json() as { ok: boolean; data?: Doc };
      if (json.ok && json.data) {
        setDoc(json.data);
        toast({ title: json.data.published_at ? "Document published." : "Document unpublished." });
      }
    } catch {
      toast({ title: "Could not update publish state.", variant: "destructive" });
    } finally {
      setTogglingPublish(false);
    }
  }

  async function handleToggleHeading(show: boolean) {
    if (!docId || !doc) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/docs/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ showHeading: show }),
      });
      const json = await res.json() as { ok: boolean; data?: Doc };
      if (json.ok && json.data) setDoc(json.data);
    } catch {
      // fail silently
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-destructive">Document not found.</p>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex h-full flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border px-6 py-2">
          <span className="text-xs text-muted-foreground">Editing</span>
          <div className="flex items-center gap-2">
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <Button variant="ghost" size="sm" onClick={cancelEditing} className="gap-1.5">
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {/* Title input */}
        <div className="border-b border-border px-6 py-3">
          <Input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            placeholder="Document title"
            className="border-0 bg-transparent px-0 text-2xl font-bold shadow-none focus-visible:ring-0"
            autoFocus={location.state?.isNew}
          />
        </div>

        {/* Split editor / preview */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-1/2 flex-col border-r border-border">
            <div className="border-b border-border px-4 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">Markdown</span>
            </div>
            <Textarea
              className="flex-1 rounded-none border-0 bg-background p-4 font-mono text-sm leading-relaxed shadow-none ring-0 focus-visible:ring-0"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Write your document in Markdown…"
              autoFocus={!location.state?.isNew}
              spellCheck={false}
            />
          </div>

          <div className="flex w-1/2 flex-col overflow-auto">
            <div className="border-b border-border px-4 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">Preview</span>
            </div>
            <div className="flex-1 overflow-auto px-8 py-6">
              {titleDraft && <h1 className="mb-4 text-2xl font-bold">{titleDraft}</h1>}
              {draft.trim() ? (
                <article className="prose prose-neutral dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>{draft}</ReactMarkdown>
                </article>
              ) : (
                <p className="text-sm text-muted-foreground/50">Nothing to preview yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const headings = extractHeadings(doc.content);
  const isEditor = myRole === "editor" || myRole === "admin" || myRole === "owner";

  return (
    <div className="flex min-h-full">
      {/* Article */}
      <div className="flex-1 min-w-0 px-6 py-10">
        <div className="mx-auto max-w-3xl relative">
          {/* Top-right editor actions */}
          {isEditor && (
            <div className="absolute top-0 right-0 flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={startEditing} title="Edit document">
                <Pencil className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" title="Document settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-4" align="end">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {doc.published_at ? (
                          <Globe className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Label className="text-sm font-medium cursor-pointer">
                          {doc.published_at ? "Published" : "Publish"}
                        </Label>
                      </div>
                      <Button
                        variant={doc.published_at ? "outline" : "default"}
                        size="sm"
                        disabled={togglingPublish}
                        onClick={handleTogglePublish}
                      >
                        {togglingPublish ? "Saving…" : doc.published_at ? "Unpublish" : "Publish"}
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="show-heading" className="text-sm font-medium cursor-pointer">
                        Show page heading
                      </Label>
                      <Switch
                        id="show-heading"
                        checked={doc.show_heading !== 0}
                        onCheckedChange={handleToggleHeading}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <article className="prose prose-neutral dark:prose-invert max-w-none">
            {doc.show_heading !== 0 && <h1>{doc.title}</h1>}
            {doc.content.trim() ? (
              <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>{doc.content}</ReactMarkdown>
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
  );
}
