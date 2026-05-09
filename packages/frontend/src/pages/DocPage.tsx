import { useState, useEffect, useRef, useMemo, isValidElement } from "react";
import { useParams, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { remarkCallouts } from "@/lib/remark-callouts";
import { remarkImageAttrs } from "@/lib/remark-image-attrs";
import { remarkUnderline } from "@/lib/remark-underline";
import { remarkWikilinks, wikilinkUrlTransform } from "@/lib/remark-wikilinks";
import { makeDocLink } from "@/components/DocLink";
import { parseFrontmatter } from "@/lib/frontmatter";
import { Callout, type CalloutType } from "@/components/Callout";
import { MarkdownCode } from "@/components/CodeBlock";
import { AuthenticatedImage } from "@/components/AuthenticatedImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { WysiwygEditor } from "@/components/wysiwyg/WysiwygEditor";
import { EditorPresence } from "@/components/EditorPresence";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { HistorySheet, type RevisionMeta } from "@/components/HistorySheet";
import { HistoryBanner } from "@/components/HistoryBanner";
import { Pencil, X, Save, Settings, Globe, Lock, Link, History, ChevronLeft, ChevronRight, Sparkles, Users, UserPlus, Trash2, HelpCircle, Code2, AlertCircle } from "lucide-react";
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

interface BlameEntry {
  u: string;
  n: string;
  t: string;
  c?: string | null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function calcReadingTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
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

const remarkPlugins = [remarkFrontmatter, remarkWikilinks, remarkGfm, remarkCallouts, remarkImageAttrs, remarkUnderline];

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
  folder_id: string | null;
  updated_at: string;
  published_at: string | null;
  show_heading: number;
  show_last_updated: number;
  display_title?: string | null;
  hide_title?: boolean | null;
  myRole?: string;
  myPermission?: string | null;
  blame?: (BlameEntry | null)[];
  ai_summary?: string | null;
  ai_summary_version?: string | null;
  tags?: string | null;
}

type SharePermission = "view" | "edit";

interface DocShareMember {
  userId: string;
  name: string;
  email: string;
  permission: SharePermission;
}

interface LimitedMember {
  userId: string;
  name: string;
  email: string;
}

interface RevisionDetail extends RevisionMeta {
  content: string;
}

export function DocPage() {
  const { projectId, docId } = useParams<{ projectId: string; docId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { updateDocTitle, setBreadcrumbs, projectName, projectPublishedAt, changelogMode, docs: allDocs, folders: allFolders, aiEnabled, aiSummarizationType, projectFeatures, currentUser } = useOutletContext<DocsLayoutContext>();
  const REALTIME = 4;
  const realtimeEnabled = !!(projectFeatures & REALTIME);
  const { toast } = useToast();

  const markdownComponents = useMemo(() => ({
    ...baseMarkdownComponents,
    img: makeAuthenticatedImage(projectId ?? ""),
    a: makeDocLink({
      docs: allDocs,
      folders: allFolders,
      buildUrl: (docId, anchor) =>
        `/projects/${projectId}/docs/${docId}${anchor ? "#" + anchor : ""}`,
    }),
  }), [projectId, allDocs, allFolders]);

  const wysiwygCtx = useMemo(() => ({
    projectId,
    isPublic: false,
    currentDocId: docId,
    revealOnCursor: true,
    docs: allDocs,
    folders: allFolders,
    buildUrl: (id: string, anchor?: string) =>
      `/projects/${projectId}/docs/${id}${anchor ? "#" + anchor : ""}`,
  }), [projectId, docId, allDocs, allFolders]);

  const [doc, setDoc] = useState<Doc | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myPermission, setMyPermission] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingPublish, setTogglingPublish] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionMeta[] | null>(null);
  const [viewingRevision, setViewingRevision] = useState<RevisionDetail | null>(null);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [changelogDialogOpen, setChangelogDialogOpen] = useState(false);
  const [changelogText, setChangelogText] = useState("");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [markdownHelpOpen, setMarkdownHelpOpen] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [docShares, setDocShares] = useState<DocShareMember[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [limitedViewerMembers, setLimitedViewerMembers] = useState<LimitedMember[]>([]);
  const [addingShareUserId, setAddingShareUserId] = useState<string | null>(null);
  const [removingShareUserId, setRemovingShareUserId] = useState<string | null>(null);
  const [updatingShareUserId, setUpdatingShareUserId] = useState<string | null>(null);
  const [folderShareLoading, setFolderShareLoading] = useState(false);
  const [pendingAddPermission, setPendingAddPermission] = useState<Record<string, SharePermission>>({});

  const [remoteEditors, setRemoteEditors] = useState<{ userId: string; name: string; color: string }[]>([]);

  // Realtime collab fatal state — set when the server rejects further sync because the
  // doc has exceeded the size cap. The editor remounts in non-collab mode while this is true.
  const [collabFatal, setCollabFatal] = useState(false);
  const [collabFatalReason, setCollabFatalReason] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resettingCollab, setResettingCollab] = useState(false);



  useEffect(() => {
    if (!docId) return;
    setLoading(true);
    setEditing(false);
    setCollabFatal(false);
    setCollabFatalReason(null);
    const token = getToken();
    fetch(`/api/docs/${docId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: Doc }) => {
        if (json.ok && json.data) {
          setDoc(json.data);
          setMyRole(json.data.myRole ?? null);
          setMyPermission(json.data.myPermission ?? null);
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

  // Sets the breadcrumb folder path. Uses location.state.folderPath when the user
  // navigates from the project sidebar (which knows the path it came from); otherwise
  // — e.g. when a wikilink jumps here — derives the path from doc.folder_id walking
  // up through the folder tree.
  useEffect(() => {
    if (!doc || !docId || doc.id !== docId) return;
    const statePath = location.state?.folderPath as { id: string | null; name: string }[] | undefined;
    // Folder ancestry without the project crumb. FileManager prefixes it; wikilink jumps don't.
    let folderAncestry: { id: string | null; name: string }[];
    if (statePath) {
      folderAncestry = statePath.length > 0 && statePath[0].id === null ? statePath.slice(1) : statePath;
    } else {
      const built: { id: string | null; name: string }[] = [];
      let currentId: string | null = doc.folder_id ?? null;
      while (currentId) {
        const folder = allFolders.find(f => f.id === currentId);
        if (!folder) break;
        built.unshift({ id: folder.id, name: folder.name });
        currentId = folder.parent_id;
      }
      folderAncestry = built;
    }
    const projectCrumb: BreadcrumbItem = {
      id: null,
      name: projectName,
      onClick: () => navigate(`/projects/${projectId}`),
    };
    const folderCrumbs: BreadcrumbItem[] = folderAncestry.map((crumb, i) => ({
      id: crumb.id,
      name: crumb.name,
      onClick: () => navigate(`/projects/${projectId}`, {
        state: { restorePath: [{ id: null, name: projectName }, ...folderAncestry.slice(0, i + 1)] },
      }),
    }));
    setBreadcrumbs([projectCrumb, ...folderCrumbs, { id: docId, name: doc.title }]);
  }, [doc, docId, allFolders, projectId, projectName, navigate, location.state, setBreadcrumbs]);

  function generateSummary() {
    if (!doc || aiSummaryLoading) return;
    const token = getToken();
    setAiSummaryLoading(true);
    fetch("/api/ai/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ docId: doc.id }),
    })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: { summary?: string } }) => {
        if (json.ok && json.data?.summary) {
          setDoc(prev => prev ? { ...prev, ai_summary: json.data!.summary, ai_summary_version: prev.updated_at } : prev);
        }
      })
      .catch(() => {})
      .finally(() => setAiSummaryLoading(false));
  }

  useEffect(() => {
    if (!doc || !aiEnabled || viewingRevision) return;
    if (aiSummarizationType !== "automatic") return;
    // If cached summary is up-to-date, no need to re-fetch
    if (doc.ai_summary && doc.ai_summary_version === doc.updated_at) return;
    generateSummary();
  }, [doc?.id, aiEnabled, aiSummarizationType, viewingRevision]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Clear collab-fatal state so the next time the user opens the editor it tries collab fresh.
    setCollabFatal(false);
    setCollabFatalReason(null);
  }

  async function handleResetCollab() {
    if (!docId) return;
    setResettingCollab(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/docs/${docId}/collab/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setCollabFatal(false);
        setCollabFatalReason(null);
        toast({ title: "Realtime sync restored." });
      } else {
        toast({ title: "Couldn't restore realtime sync.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Couldn't restore realtime sync.", variant: "destructive" });
    } finally {
      setResettingCollab(false);
    }
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

  async function openShareDialog() {
    setShareDialogOpen(true);
    setSharesLoading(true);
    const token = getToken();
    const [sharesRes, membersRes] = await Promise.all([
      fetch(`/api/docs/${docId}/shares`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/projects/${projectId}/members`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const sharesJson = await sharesRes.json() as { ok: boolean; data?: DocShareMember[] };
    const membersJson = await membersRes.json() as { ok: boolean; data?: { userId: string; name: string; email: string; role: string }[] };
    if (sharesJson.ok) setDocShares(sharesJson.data ?? []);
    if (membersJson.ok) {
      setLimitedViewerMembers((membersJson.data ?? [])
        .filter(m => m.role === "limited")
        .map(m => ({ userId: m.userId, name: m.name, email: m.email })));
    }
    setSharesLoading(false);
  }

  async function addShare(userId: string, permission: SharePermission) {
    setAddingShareUserId(userId);
    try {
      const token = getToken();
      const res = await fetch(`/api/docs/${docId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, permission }),
      });
      const json = await res.json() as { ok: boolean; data?: DocShareMember };
      if (json.ok && json.data) setDocShares(prev => [...prev.filter(s => s.userId !== userId), json.data!]);
    } finally {
      setAddingShareUserId(null);
    }
  }

  async function updateSharePermission(userId: string, permission: SharePermission) {
    setUpdatingShareUserId(userId);
    try {
      const token = getToken();
      const res = await fetch(`/api/docs/${docId}/shares/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permission }),
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) setDocShares(prev => prev.map(s => s.userId === userId ? { ...s, permission } : s));
    } finally {
      setUpdatingShareUserId(null);
    }
  }

  async function removeShare(userId: string) {
    setRemovingShareUserId(userId);
    try {
      const token = getToken();
      const res = await fetch(`/api/docs/${docId}/shares/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) setDocShares(prev => prev.filter(s => s.userId !== userId));
    } finally {
      setRemovingShareUserId(null);
    }
  }

  async function shareFolderWith(userId: string, permission: SharePermission) {
    if (!doc?.folder_id || !projectId) return;
    setFolderShareLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/projects/${projectId}/folder-shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, folderId: doc.folder_id, permission }),
      });
      const json = await res.json() as { ok: boolean; data?: { granted: number } };
      if (json.ok) {
        const sharesRes = await fetch(`/api/docs/${docId}/shares`, { headers: { Authorization: `Bearer ${token}` } });
        const sharesJson = await sharesRes.json() as { ok: boolean; data?: DocShareMember[] };
        if (sharesJson.ok) setDocShares(sharesJson.data ?? []);
        toast({ title: `Shared ${json.data?.granted ?? 0} documents in this folder.` });
      }
    } finally {
      setFolderShareLoading(false);
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
            {realtimeEnabled && <EditorPresence editors={remoteEditors} />}
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            {collabFatal && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setResetConfirmOpen(true)}
                title="Realtime sync is disabled — click to restore"
                className="gap-1.5"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Sync disabled
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMarkdownHelpOpen(true)}
              title="Markdown reference"
              className="h-8 w-8"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            <Button
              variant={rawMode ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setRawMode(v => !v)}
              title={rawMode ? "Switch to WYSIWYG editor" : "Switch to raw markdown"}
              aria-pressed={rawMode}
              className="h-8 w-8"
            >
              <Code2 className="h-4 w-4" />
            </Button>
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

        <div className="flex flex-1 overflow-hidden">
          <div className="relative flex-1 overflow-hidden">
            <WysiwygEditor
              key={collabFatal ? "fallback" : "collab"}
              mode={rawMode ? "raw" : "editing"}
              value={draft}
              onChange={setDraft}
              onSave={handleSaveClick}
              autoFocus={!location.state?.isNew}
              collab={!collabFatal && realtimeEnabled && currentUser ? { docId: doc.id, user: currentUser } : undefined}
              onAwarenessChange={realtimeEnabled && !collabFatal ? setRemoteEditors : undefined}
              onCollabFatal={(reason) => {
                setCollabFatal(true);
                setCollabFatalReason(reason || null);
                setRemoteEditors([]);
              }}
              rendererCtx={wysiwygCtx}
            />
          </div>
        </div>

        <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Congratulations! You broke it! Realtime sync disabled</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>{collabFatalReason || "This document has exceeded the realtime sync size limit."}</p>
                  <p>Your edits still save, but they won't sync live with other users until sync is restored.</p>
                  <p>Restoring wipes the realtime sync state. Any unsaved in-progress edits from other users will be discarded, so save your own changes first if you don't want to lose them.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resettingCollab}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetCollab} disabled={resettingCollab}>
                {resettingCollab ? "Restoring…" : "Restore realtime sync"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Markdown reference dialog */}
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
                  <Code>{`[link text](https://example.com)\n![alt text](https://example.com/img.png)\n![alt](img.png){width=300}             fixed width (px)\n![alt](img.png){width=50%}             percentage width\n![alt](img.png){width=400 height=200}  width and height`}</Code>
                </Section>
                <Section title="Document links">
                  <Code>{`[[My Document]]                   link by title\n[[My Document|custom label]]      link with display text\n[[My Document#section]]           link to a heading anchor\n[[My Document#section|see this]]  anchor link with label`}</Code>
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
                <Section title="Dice roller">
                  <Code>{`\`dice: 1d20\`             standard roll\n\`dice: 2d6+1d4+3\`       compound expression\n\`dice: 4d6kh3\`          keep highest 3\n\`dice: 4d6kl3\`          keep lowest 3\n\`dice: 2d8r1\`           reroll 1s (unlimited)\n\`dice: 2d8r<3\`          reroll less than 3\n\`dice: 2d8r>5\`          reroll greater than 5\n\`dice: 2d8r1r3\`         reroll 1s and 3s\n\`dice: 4d6kh3r1\`        keep highest 3, reroll 1s\n\`dice: 2d10ro<2\`        reroll once if less than 2\n\`dice: 2dF\`             fate/fudge dice (-1, 0, +1)\n\`dice: 1d[2,4,6,8]\`    custom numeric faces\n\`dice: 1d[fire,ice]\`   random string table\n\`dice: 2d6[Fire]\`      inline label\n\`dice: 2d6%4\`          modulus\n\`dice: 2d6**2\`         exponentiation\n\`dice: floor(2d6/3)\`   math function\n\`dice: (2d6+1d4)*2\`    grouping with parentheses\n\`dice: 1d20 Attack Roll\`         overall label\n\`dice: 1d20+5 \\ +5 for initiative\` label with separator`}</Code>
                  <p className="text-xs text-muted-foreground mt-1">Click the die icon to roll. Click again to re-roll. Hover the result for a full breakdown. Math functions: <span className="font-mono">floor</span>, <span className="font-mono">ceil</span>, <span className="font-mono">round</span>, <span className="font-mono">abs</span>.</p>
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
  const isEditor = myRole === "editor" || myRole === "admin" || myRole === "owner" || (myRole === "limited" && myPermission === "edit");
  const isAdmin = myRole === "admin" || myRole === "owner";

  return (
    <div className="flex min-h-full">
      {/* Article */}
      <div className="flex-1 min-w-0 px-6 py-10">
        <div className="mx-auto max-w-3xl md:relative">
          {/* Top-right actions */}
          <div className="flex justify-end gap-1 mb-2 md:absolute md:top-0 md:right-0 md:mb-0">
            {!viewingRevision && aiEnabled && aiSummarizationType === "manual" && (
              <Button variant="ghost" size="icon" title="Generate AI summary" onClick={generateSummary} disabled={aiSummaryLoading}>
                <Sparkles className="h-4 w-4 text-violet-500" />
              </Button>
            )}
          {isEditor && (
            <>
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
              {isAdmin && (
                <>
                  <Button variant="ghost" size="icon" title="Manage limited viewer access" onClick={openShareDialog}>
                    <Users className="h-4 w-4" />
                  </Button>
                  <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Guest Access</DialogTitle>
                        <DialogDescription>
                          Control which limited viewers can read this document.
                        </DialogDescription>
                      </DialogHeader>
                      {sharesLoading ? (
                        <p className="text-sm text-muted-foreground py-2">Loading…</p>
                      ) : (
                        <div className="flex flex-col gap-4 py-2">
                          {docShares.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No limited members have access to this document.</p>
                          ) : (
                            <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                              {docShares.map(share => (
                                <div key={share.userId} className="flex items-center gap-3 px-3 py-2.5">
                                  <div className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-sm font-medium">{share.name}</span>
                                    <span className="truncate text-xs text-muted-foreground">{share.email}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Select
                                      value={share.permission}
                                      onValueChange={val => updateSharePermission(share.userId, val as SharePermission)}
                                      disabled={updatingShareUserId === share.userId}
                                    >
                                      <SelectTrigger className="h-7 w-[80px] text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="view">View</SelectItem>
                                        <SelectItem value="edit">Edit</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => removeShare(share.userId)}
                                      disabled={removingShareUserId === share.userId}
                                      title="Revoke access"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {limitedViewerMembers.filter(m => !docShares.some(s => s.userId === m.userId)).length > 0 && (
                            <div className="flex flex-col gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add limited member</p>
                              <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                                {limitedViewerMembers
                                  .filter(m => !docShares.some(s => s.userId === m.userId))
                                  .map(member => (
                                    <div key={member.userId} className="flex items-center gap-3 px-3 py-2.5">
                                      <div className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-sm font-medium">{member.name}</span>
                                        <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <Select
                                          value={pendingAddPermission[member.userId] ?? "view"}
                                          onValueChange={val => setPendingAddPermission(prev => ({ ...prev, [member.userId]: val as SharePermission }))}
                                        >
                                          <SelectTrigger className="h-7 w-[80px] text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="view">View</SelectItem>
                                            <SelectItem value="edit">Edit</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => addShare(member.userId, pendingAddPermission[member.userId] ?? "view")}
                                          disabled={addingShareUserId === member.userId}
                                          title="Grant access"
                                        >
                                          <UserPlus className="h-3.5 w-3.5" />
                                        </Button>
                                        {doc?.folder_id && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => shareFolderWith(member.userId, pendingAddPermission[member.userId] ?? "view")}
                                            disabled={folderShareLoading}
                                            title="Share all docs in this folder"
                                          >
                                            Folder
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                          {limitedViewerMembers.length === 0 && (
                            <p className="text-xs text-muted-foreground">No limited members in this project yet. Invite them from Site Settings.</p>
                          )}
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </>
              )}
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
                          {(doc.published_at || projectPublishedAt) && (
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
            </>
          )}
          </div>

          {viewingRevision && (
            <HistoryBanner
              editorName={(() => {
                if (viewingRevision.contributors) {
                  try {
                    const cs = JSON.parse(viewingRevision.contributors) as { id: string; name: string }[];
                    if (cs.length > 1) return cs.map(c => c.name).join(", ");
                  } catch { /* */ }
                }
                return viewingRevision.editor_name;
              })()}
              createdAt={viewingRevision.created_at}
              onBack={() => setViewingRevision(null)}
              onRevert={isEditor ? handleRevert : undefined}
              reverting={reverting}
              className={`mb-6${isEditor ? " mr-32" : ""}`}
            />
          )}
          <article className="prose prose-neutral dark:prose-invert max-w-none">
            {(() => {
              const fm = parseFrontmatter(viewingRevision ? viewingRevision.content : doc.content);
              const showHeading = fm.hide_title !== undefined ? !fm.hide_title : doc.show_heading !== 0;
              const headingTitle = fm.title ?? doc.title;
              return showHeading && <h1>{headingTitle}</h1>;
            })()}
            {!viewingRevision && doc.show_last_updated !== 0 && (
              <p className="not-prose -mt-2 mb-6 text-sm text-muted-foreground">
                Last updated {timeAgo(doc.updated_at)} · {calcReadingTime(doc.content)}
              </p>
            )}
            {!viewingRevision && aiEnabled && (aiSummaryLoading || doc.ai_summary) && (
              <div className="not-prose mb-6 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/30">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Summary
                </p>
                {aiSummaryLoading ? (
                  <div className="space-y-2 pt-0.5">
                    <Skeleton className="h-3.5 w-full bg-violet-200/60 dark:bg-violet-800/40" />
                    <Skeleton className="h-3.5 w-5/6 bg-violet-200/60 dark:bg-violet-800/40" />
                    <Skeleton className="h-3.5 w-4/6 bg-violet-200/60 dark:bg-violet-800/40" />
                  </div>
                ) : (
                  <div className="prose prose-sm prose-violet dark:prose-invert max-w-none text-violet-900/80 dark:text-violet-200/80 [&_ul]:my-1 [&_li]:my-0">
                    <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents} urlTransform={wikilinkUrlTransform}>
                      {doc.ai_summary ?? ""}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
            {(viewingRevision ? viewingRevision.content : doc.content).trim() ? (
              <div className="not-prose">
                <WysiwygEditor
                  mode="reading"
                  value={viewingRevision ? viewingRevision.content : doc.content}
                  rendererCtx={wysiwygCtx}
                />
              </div>
            ) : (
              <p className="not-prose text-sm italic text-muted-foreground/60">
                This page has no content yet.
              </p>
            )}
          </article>

          {(() => {
            const tags: string[] = doc.tags ? JSON.parse(doc.tags) : [];
            if (!tags.length) return null;
            return (
              <div className="not-prose mt-8 flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => navigate(`/projects/${projectId}/tags/${encodeURIComponent(tag)}`)}
                    className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            );
          })()}

          {(() => {
            const idx = allDocs.findIndex(d => d.id === docId);
            if (idx === -1 || allDocs.length < 2) return null;
            const prevDoc = idx > 0 ? allDocs[idx - 1] : null;
            const nextDoc = idx < allDocs.length - 1 ? allDocs[idx + 1] : null;
            return (
              <div className="not-prose mt-12 flex justify-between gap-4">
                {prevDoc ? (
                  <button
                    onClick={() => navigate(`/projects/${projectId}/docs/${prevDoc.id}`)}
                    className="group flex flex-col gap-0.5 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent w-[calc(50%-8px)]"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <ChevronLeft className="h-3.5 w-3.5" /> Previous
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">{prevDoc.title}</span>
                  </button>
                ) : <div />}
                {nextDoc ? (
                  <button
                    onClick={() => navigate(`/projects/${projectId}/docs/${nextDoc.id}`)}
                    className="group flex flex-col gap-0.5 rounded-lg border border-border bg-card p-4 text-right transition-colors hover:bg-accent w-[calc(50%-8px)] items-end ml-auto"
                  >
                    <span className="flex items-center justify-end gap-1.5 text-xs font-medium text-muted-foreground">
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">{nextDoc.title}</span>
                  </button>
                ) : <div />}
              </div>
            );
          })()}

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
