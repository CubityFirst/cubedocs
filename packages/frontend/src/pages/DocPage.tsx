import { useState, useEffect, useCallback, useRef, useMemo, isValidElement } from "react";
import { useParams, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCallouts } from "@/lib/remark-callouts";
import { remarkImageAttrs } from "@/lib/remark-image-attrs";
import { remarkUnderline } from "@/lib/remark-underline";
import { Callout, type CalloutType } from "@/components/Callout";
import { MarkdownCode } from "@/components/CodeBlock";
import { AuthenticatedImage } from "@/components/AuthenticatedImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HistorySheet, type RevisionMeta } from "@/components/HistorySheet";
import { HistoryBanner } from "@/components/HistoryBanner";
import { Pencil, X, Save, Settings, Globe, Lock, Link, History } from "lucide-react";
import type { DocsLayoutContext, BreadcrumbItem } from "@/layouts/DocsLayout";
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

interface BlameEntry {
  u: string;
  n: string;
  t: string;
  c?: string | null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}



function applyMarker(value: string, start: number, end: number, marker: string) {
  const ml = marker.length;
  const selected = value.slice(start, end);

  // True iff `str` is wrapped in exactly `marker` (not a longer marker like ** vs *)
  const exactWrap = (str: string) => {
    if (str.length < ml * 2 + 1 || !str.startsWith(marker) || !str.endsWith(marker)) return false;
    if (marker === "*") return str[ml] !== "*" && str[str.length - ml - 1] !== "*";
    return true;
  };

  // Case 1: markers sit just outside the current selection
  const before = start >= ml ? value.slice(start - ml, start) : "";
  const after = value.slice(end, end + ml);
  const outerMatch =
    before === marker &&
    after === marker &&
    (marker !== "*" || (value[start - ml - 1] !== "*" && value[end + ml] !== "*"));

  if (outerMatch) {
    return { value: value.slice(0, start - ml) + selected + value.slice(end + ml), start: start - ml, end: end - ml };
  }

  // Case 2: selection itself includes the markers
  if (exactWrap(selected)) {
    const inner = selected.slice(ml, selected.length - ml);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }

  // Case 3: add markers
  return { value: value.slice(0, start) + marker + selected + marker + value.slice(end), start: start + ml, end: end + ml };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre">{children}</pre>
  );
}

const remarkPlugins = [remarkGfm, remarkCallouts, remarkImageAttrs, remarkUnderline];

function makeAuthenticatedImage(projectId: string) {
  return function AuthImg(props: React.ComponentPropsWithoutRef<"img">) {
    return <AuthenticatedImage {...props} projectId={projectId} />;
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

interface Doc {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  published_at: string | null;
  show_heading: number;
  show_last_updated: number;
  myRole?: string;
  blame?: (BlameEntry | null)[];
}

interface RevisionDetail extends RevisionMeta {
  content: string;
}

export function DocPage() {
  const { projectId, docId } = useParams<{ projectId: string; docId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { updateDocTitle, setBreadcrumbs, projectPublishedAt, changelogMode } = useOutletContext<DocsLayoutContext>();
  const { toast } = useToast();

  const markdownComponents = useMemo(() => ({
    ...baseMarkdownComponents,
    img: makeAuthenticatedImage(projectId ?? ""),
  }), [projectId]);

  const [doc, setDoc] = useState<Doc | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingPublish, setTogglingPublish] = useState(false);
  const [activeLine, setActiveLine] = useState<number>(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionMeta[] | null>(null);
  const [viewingRevision, setViewingRevision] = useState<RevisionDetail | null>(null);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [changelogDialogOpen, setChangelogDialogOpen] = useState(false);
  const [changelogText, setChangelogText] = useState("");
const [editorScrollTop, setEditorScrollTop] = useState(0);
  const [markdownHelpOpen, setMarkdownHelpOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleEditorActivity = useCallback((e: React.MouseEvent<HTMLTextAreaElement> | React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const beforeCursor = ta.value.slice(0, ta.selectionStart ?? 0);
    setActiveLine(beforeCursor.split("\n").length - 1);
  }, []);



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
          const rawPath: { id: string | null; name: string }[] = location.state?.folderPath ?? [];
          const folderPath: BreadcrumbItem[] = rawPath.map((crumb, i) => ({
            id: crumb.id,
            name: crumb.name,
            onClick: () => navigate(`/projects/${projectId}`, { state: { restorePath: rawPath.slice(0, i + 1) } }),
          }));
          setBreadcrumbs([...folderPath, { id: docId, name: json.data.title }]);
          if (location.state?.isNew) {
            setTitleDraft(json.data.title);
            setDraft(json.data.content);
            setEditing(true);
            navigate(location.pathname, { replace: true, state: { folderPath: location.state.folderPath } });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => setBreadcrumbs([]);
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEditing() {
    if (!doc) return;
    setTitleDraft(doc.title);
    setDraft(doc.content);
    setSaveError(null);
    setActiveLine(0);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError(null);
  }

  async function handleSave(changelog?: string) {
    if (!docId || !doc) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = getToken();
      const body: Record<string, unknown> = { title: titleDraft, content: draft };
      if (changelog) body.changelog = changelog;
      const res = await fetch(`/api/docs/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { ok: boolean; data?: Doc };
      if (json.ok && json.data) {
        setDoc(json.data);
        updateDocTitle(docId, json.data.title);
        setBreadcrumbs(prev => prev.map((c, i) => i === prev.length - 1 ? { ...c, name: json.data!.title } : c));
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

  function handleSaveClick() {
    if (changelogMode === "off") {
      handleSave();
    } else {
      setChangelogText("");
      setChangelogDialogOpen(true);
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

  async function handleToggleLastUpdated(show: boolean) {
    if (!docId || !doc) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/docs/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ showLastUpdated: show }),
      });
      const json = await res.json() as { ok: boolean; data?: Doc };
      if (json.ok && json.data) setDoc(json.data);
    } catch {
      // fail silently
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

  async function openHistory() {
    setHistoryOpen(true);
    setViewingRevision(null);
    setRevisions(null);
    const token = getToken();
    const res = await fetch(`/api/docs/${docId}/revisions`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json() as { ok: boolean; data?: RevisionMeta[] };
    if (json.ok) setRevisions(json.data ?? []);
  }

  async function viewRevision(revisionId: string) {
    setLoadingRevision(true);
    const token = getToken();
    const res = await fetch(`/api/docs/${docId}/revisions/${revisionId}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json() as { ok: boolean; data?: RevisionDetail };
    if (json.ok && json.data) setViewingRevision(json.data);
    setLoadingRevision(false);
  }

  async function handleRevert() {
    if (!docId || !viewingRevision) return;
    setReverting(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/docs/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: viewingRevision.content }),
      });
      const json = await res.json() as { ok: boolean; data?: Doc };
      if (json.ok && json.data) {
        setDoc(json.data);
        updateDocTitle(docId, json.data.title);
        setViewingRevision(null);
        toast({ title: "Document reverted to historical version." });
      } else {
        toast({ title: "Failed to revert.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server.", variant: "destructive" });
    } finally {
      setReverting(false);
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
        {/* Title + toolbar */}
        <div className="flex items-center gap-4 border-b border-border px-6 py-3">
          <Input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            placeholder="Document title"
            className="min-w-0 max-w-sm border-0 bg-transparent px-0 text-2xl font-bold shadow-none focus-visible:ring-0"
            autoFocus={location.state?.isNew}
          />
          <div className="ml-auto flex items-center gap-2">
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <Button variant="ghost" size="sm" onClick={cancelEditing} className="gap-1.5">
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveClick} disabled={saving} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {/* Split editor / preview */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-1/2 flex-col border-r border-border">
            <div className="border-b border-border px-4 py-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Markdown</span>
              <button
                onClick={() => setMarkdownHelpOpen(true)}
                title="Markdown help"
                className="flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/30 text-[10px] font-medium text-muted-foreground/40 transition-colors hover:border-muted-foreground hover:text-muted-foreground"
              >
                ?
              </button>
            </div>
            <div className="relative flex-1 overflow-hidden">
              <Textarea
                ref={textareaRef}
                className="absolute inset-0 rounded-none border-0 bg-background p-4 font-mono text-sm leading-relaxed shadow-none ring-0 focus-visible:ring-0"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    handleSaveClick();
                    return;
                  }
                  if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key)) {
                    e.preventDefault();
                    const ta = e.currentTarget;
                    const marker = e.key === 'b' ? '**' : e.key === 'i' ? '*' : '__';
                    const result = applyMarker(ta.value, ta.selectionStart, ta.selectionEnd, marker);
                    setDraft(result.value);
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        textareaRef.current.setSelectionRange(result.start, result.end);
                      }
                    });
                  }
                }}
                onClick={handleEditorActivity}
                onKeyUp={handleEditorActivity}
                onScroll={e => setEditorScrollTop(e.currentTarget.scrollTop)}
                placeholder="Write your document in Markdown…"
                autoFocus={!location.state?.isNew}
                spellCheck={false}
              />
              {(() => {
                const entry = doc.blame?.[activeLine] ?? null;
                if (!entry) return null;
                const lineHeight = 22.75; // text-sm (14px) × leading-relaxed (1.625)
                const paddingTop = 16; // p-4
                const top = paddingTop + activeLine * lineHeight - editorScrollTop;
                const parts: string[] = [];
                if (entry.c) parts.push(`"${truncate(entry.c, 32)}"`);
                parts.push(entry.n);
                parts.push(timeAgo(entry.t));
                return (
                  <div
                    className="pointer-events-none absolute right-4 font-mono text-xs text-muted-foreground/35 select-none whitespace-nowrap"
                    style={{ top: `${top}px`, lineHeight: `${lineHeight}px` }}
                  >
                    {parts.join(" · ")}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="flex w-1/2 flex-col overflow-auto">
            <div className="border-b border-border px-4 py-1.5 flex items-center">
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

        <Dialog open={markdownHelpOpen} onOpenChange={setMarkdownHelpOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Markdown reference</DialogTitle>
              <DialogDescription>Supported syntax in this editor.</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[60vh] mt-3 pr-4">
              <div className="flex flex-col gap-5 pb-2 text-sm">
                <Section title="Headings">
                  <Code>{`# H1\n## H2\n### H3`}</Code>
                </Section>
                <Section title="Emphasis">
                  <Code>{`**bold**       Ctrl+B\n*italic*       Ctrl+I\n__underline__  Ctrl+U\n~~strikethrough~~`}</Code>
                </Section>
                <Section title="Links & images">
                  <Code>{`[link text](https://example.com)\n![alt text](https://example.com/img.png)`}</Code>
                </Section>
                <Section title="Lists">
                  <Code>{`- unordered item\n- another item\n\n1. ordered item\n2. another item`}</Code>
                </Section>
                <Section title="Task lists">
                  <Code>{`- [x] done\n- [ ] not done`}</Code>
                </Section>
                <Section title="Tables">
                  <Code>{`| Col A | Col B |\n|-------|-------|\n| one   | two   |`}</Code>
                </Section>
                <Section title="Code">
                  <Code>{`\`inline code\`\n\n\`\`\`typescript\nconst x = 42;\n\`\`\``}</Code>
                  <p className="text-xs text-muted-foreground mt-1">Supported languages: TypeScript, JavaScript, Python, Rust, Go, Java, Bash, SQL, JSON, and more.</p>
                </Section>
                <Section title="Blockquote">
                  <Code>{`> This is a blockquote.`}</Code>
                </Section>
                <Section title="Callouts">
                  <Code>{`> [!note]\n> This is a note.\n\n> [!warning] Watch out\n> Something to be careful about.\n\n> [!tip]+ Foldable tip\n> This starts open.\n\n> [!danger]- Foldable danger\n> This starts closed.`}</Code>
                  <p className="text-xs text-muted-foreground mt-1">Types: <span className="font-mono">note</span>, <span className="font-mono">info</span>, <span className="font-mono">tip</span>, <span className="font-mono">success</span>, <span className="font-mono">warning</span>, <span className="font-mono">danger</span>, <span className="font-mono">bug</span>, <span className="font-mono">question</span>, <span className="font-mono">quote</span>, <span className="font-mono">example</span>, <span className="font-mono">abstract</span>, <span className="font-mono">todo</span>, <span className="font-mono">failure</span></p>
                </Section>
                <Section title="Horizontal rule">
                  <Code>{`---`}</Code>
                </Section>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={changelogDialogOpen} onOpenChange={open => { if (!saving) setChangelogDialogOpen(open); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>What did you change?</DialogTitle>
              <DialogDescription>
                {changelogMode === "enforced"
                  ? "A changelog entry is required before saving."
                  : "Leave a brief note describing your changes. This will appear in the document history."}
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={changelogText}
              onChange={e => setChangelogText(e.target.value)}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (!saving && !(changelogMode === 'enforced' && !changelogText.trim())) {
                    setChangelogDialogOpen(false);
                    handleSave(changelogText.trim() || undefined);
                  }
                }
              }}
              placeholder="e.g. Fixed typo in introduction, added new section on deployment…"
              className="min-h-[80px]"
              autoFocus
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setChangelogDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>

              <Button
                disabled={saving || (changelogMode === "enforced" && !changelogText.trim())}
                onClick={() => {
                  setChangelogDialogOpen(false);
                  handleSave(changelogText.trim() || undefined);
                }}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
              <Button variant="ghost" size="icon" title="View history" onClick={openHistory}>
                <History className="h-4 w-4" />
              </Button>
              <HistorySheet
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                revisions={revisions}
                selectedId={viewingRevision?.id}
                loading={loadingRevision}
                onSelect={viewRevision}
              />
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" title="Document settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Document Settings</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-6 py-2">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {doc.published_at ? (
                              <Globe className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <Lock className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Label className="text-sm font-medium">
                              {doc.published_at ? "Published" : "Unpublished"}
                            </Label>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {doc.published_at
                              ? "This document is marked as published."
                              : "This document is marked as unpublished."}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {doc.published_at && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/s/${projectId}/${docId}`);
                                toast({ title: "Link copied to clipboard." });
                              }}
                              title="Copy share link"
                            >
                              <Link className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant={doc.published_at ? "outline" : "default"}
                            size="sm"
                            disabled={togglingPublish}
                            onClick={handleTogglePublish}
                          >
                            {togglingPublish ? "Saving…" : doc.published_at ? "Unpublish" : "Publish"}
                          </Button>
                        </div>
                      </div>
                      {projectPublishedAt && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          The site is currently published — individual document publish status has no effect until the site is unpublished.
                        </p>
                      )}
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="show-heading" className="text-sm font-medium cursor-pointer">
                          Show page heading
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Display the document title as a heading at the top of the page.
                        </p>
                      </div>
                      <Switch
                        id="show-heading"
                        checked={doc.show_heading !== 0}
                        onCheckedChange={handleToggleHeading}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="show-last-updated" className="text-sm font-medium cursor-pointer">
                          Show last updated
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Display when the document was last modified.
                        </p>
                      </div>
                      <Switch
                        id="show-last-updated"
                        checked={doc.show_last_updated !== 0}
                        onCheckedChange={handleToggleLastUpdated}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {viewingRevision && (
            <HistoryBanner
              editorName={viewingRevision.editor_name}
              createdAt={viewingRevision.created_at}
              onBack={() => setViewingRevision(null)}
              onRevert={isEditor ? handleRevert : undefined}
              reverting={reverting}
              className={`mb-6${isEditor ? " mr-32" : ""}`}
            />
          )}
          <article className="prose prose-neutral dark:prose-invert max-w-none">
            {doc.show_heading !== 0 && <h1>{doc.title}</h1>}
            {!viewingRevision && doc.show_last_updated !== 0 && (
              <p className="not-prose -mt-2 mb-6 text-sm text-muted-foreground">
                Last updated {timeAgo(doc.updated_at)}
              </p>
            )}
            {(viewingRevision ? viewingRevision.content : doc.content).trim() ? (
              <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
                {viewingRevision ? viewingRevision.content : doc.content}
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
  );
}
