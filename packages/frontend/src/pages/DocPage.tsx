import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCallouts } from "@/lib/remark-callouts";
import { Callout, type CalloutType } from "@/components/Callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Pencil, X, Save } from "lucide-react";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";

const remarkPlugins = [remarkGfm, remarkCallouts];

const markdownComponents = {
  blockquote({ children, node, ...props }: React.ComponentPropsWithoutRef<"blockquote"> & { node?: { properties?: Record<string, unknown> } }) {
    const calloutType = node?.properties?.["data-callout"] as CalloutType | undefined;
    if (calloutType) {
      return <Callout type={calloutType}>{children}</Callout>;
    }
    return <blockquote {...props}>{children}</blockquote>;
  },
};

interface Doc {
  id: string;
  title: string;
  slug: string;
  content: string;
  updatedAt: string;
}

export function DocPage() {
  const { projectId: _projectId, docId } = useParams<{ projectId: string; docId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { updateDocTitle } = useOutletContext<DocsLayoutContext>();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;
    setLoading(true);
    setEditing(false);
    const token = localStorage.getItem("token");
    fetch(`/api/docs/${docId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: Doc }) => {
        if (json.ok && json.data) {
          setDoc(json.data);
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
      const token = localStorage.getItem("token");
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <h1>{doc.title}</h1>
        {doc.content.trim() ? (
          <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>{doc.content}</ReactMarkdown>
        ) : (
          <p className="not-prose text-sm italic text-muted-foreground/60">
            This page has no content yet. Click "Edit this page" to add some.
          </p>
        )}
      </article>

      <Separator className="mt-16" />
      <div className="pt-6">
        <Button variant="outline" size="sm" onClick={startEditing} className="gap-2">
          <Pencil className="h-3.5 w-3.5" />
          Edit this page
        </Button>
      </div>
    </div>
  );
}
