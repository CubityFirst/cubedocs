import { useState, useEffect, useRef } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";
import { Folder, Lock, Plus, FolderPlus, Search, Eye, EyeOff, Copy, Check, ExternalLink, Pencil, Trash2, Shuffle, User, Key, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ResizableTable, ResizableTableRow } from "@/components/ui/resizable-table";
import { getToken } from "@/lib/auth";

interface FolderItem {
  id: string;
  name: string;
  project_id: string;
  parent_id: string | null;
  created_at: string;
}

interface PasswordEntry {
  id: string;
  title: string;
  username: string | null;
  url: string | null;
  folder_id: string | null;
  last_change_date: string;
  updated_at: string;
}

interface PasswordDetail {
  id: string;
  title: string;
  username: string | null;
  password: string;
  totp: string | null;
  url: string | null;
  notes: string | null;
  folder_id: string | null;
  last_change_date: string;
  updated_at: string;
}

interface BreadcrumbEntry {
  id: string | null;
  name: string;
}

interface EntryForm {
  title: string;
  username: string;
  password: string;
  totp: string;
  url: string;
  notes: string;
}

const BLANK_FORM: EntryForm = { title: "", username: "", password: "", totp: "", url: "", notes: "" };

// ── Crypto helpers ──────────────────────────────────────────────────────────

function base32Decode(s: string): Uint8Array {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = s.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of cleaned) {
    const i = alpha.indexOf(c);
    if (i < 0) continue;
    val = (val << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

async function computeTOTP(secret: string): Promise<string> {
  const keyBytes = base32Decode(secret);
  const step = Math.floor(Date.now() / 1000 / 30);
  const msg = new ArrayBuffer(8);
  new DataView(msg).setUint32(4, step, false);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const off = sig[19] & 0xf;
  const code = ((sig[off] & 0x7f) << 24 | sig[off + 1] << 16 | sig[off + 2] << 8 | sig[off + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

function generatePassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const arr = new Uint8Array(20);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join("");
}

// ── Utilities ────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CopyBtn({ text, field, copied, onCopy }: { text: string; field: string; copied: string | null; onCopy: (t: string, f: string) => void }) {
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onCopy(text, field)}>
      {copied === field ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function TOTPDisplay({ secret }: { secret: string }) {
  const [code, setCode] = useState("------");
  const [secs, setSecs] = useState(30);

  useEffect(() => {
    let live = true;
    async function tick() {
      if (!live) return;
      const now = Math.floor(Date.now() / 1000);
      setSecs(30 - (now % 30));
      try { if (live) setCode(await computeTOTP(secret)); }
      catch { if (live) setCode("------"); }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => { live = false; clearInterval(id); };
  }, [secret]);

  return (
    <div className="flex items-center gap-2">
      <span className={`font-mono text-lg tracking-widest ${secs <= 5 ? "text-destructive" : ""}`}>{code}</span>
      <span className={`text-xs ${secs <= 5 ? "text-destructive" : "text-muted-foreground"}`}>{secs}s</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  projectName: string;
}

export function PasswordVaultManager({ projectId, projectName }: Props) {
  const location = useLocation();
  const { setBreadcrumbs } = useOutletContext<DocsLayoutContext>();

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const initialPath: BreadcrumbEntry[] = location.state?.restorePath ?? [{ id: null, name: projectName }];
  const [path, setPath] = useState<BreadcrumbEntry[]>(initialPath);
  const currentFolderId = path[path.length - 1].id;

  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PasswordEntry[] | null>(null);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Dialog: null = closed, 'new' = create form, 'view' = detail view, 'edit' = edit form
  const [dialog, setDialog] = useState<null | "new" | "view" | "edit">(null);
  const [detailEntry, setDetailEntry] = useState<PasswordDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [form, setForm] = useState<EntryForm>(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Reveal toggles
  const [revealPassword, setRevealPassword] = useState(false);
  const [revealTotp, setRevealTotp] = useState(false);
  const [revealFormPassword, setRevealFormPassword] = useState(false);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Drag state
  const draggedItem = useRef<{ type: "entry" | "folder"; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);

  useEffect(() => {
    loadContents();
  }, [currentFolderId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setBreadcrumbs(path.map((crumb, i) => {
      const isLast = i === path.length - 1;
      const crumbKey = crumb.id ?? "root";
      return {
        id: crumb.id,
        name: crumb.name,
        onClick: isLast ? undefined : () => navigateToCrumb(i),
        onDragOver: (e: React.DragEvent) => onCrumbDragOver(e, crumb.id),
        onDragLeave: onCrumbDragLeave,
        onDrop: (e: React.DragEvent) => onCrumbDrop(e, crumb.id),
        isDropTarget: dropTarget === crumbKey,
      };
    }));
    return () => setBreadcrumbs([]);
  }, [path, dropTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`/api/passwords?projectId=${projectId}&q=${encodeURIComponent(searchQuery.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { ok: boolean; data?: PasswordEntry[] };
      if (json.ok && json.data) setSearchResults(json.data);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadContents() {
    const token = getToken();
    if (!token) return;
    const folderParam = currentFolderId ? `&parentId=${currentFolderId}` : "";
    const folderIdParam = currentFolderId ? `&folderId=${currentFolderId}` : "&folderId=";
    const [foldersRes, entriesRes] = await Promise.all([
      fetch(`/api/folders?projectId=${projectId}&type=passwords${folderParam}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/passwords?projectId=${projectId}${folderIdParam}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const foldersJson = await foldersRes.json() as { ok: boolean; data?: FolderItem[] };
    const entriesJson = await entriesRes.json() as { ok: boolean; data?: PasswordEntry[] };
    if (foldersJson.ok && foldersJson.data) setFolders(foldersJson.data);
    if (entriesJson.ok && entriesJson.data) setEntries(entriesJson.data);
  }

  function enterFolder(folder: FolderItem) {
    setPath(prev => [...prev, { id: folder.id, name: folder.name }]);
  }

  function navigateToCrumb(index: number) {
    setPath(prev => prev.slice(0, index + 1));
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim() || creatingFolder) return;
    setCreatingFolder(true);
    try {
      const token = getToken();
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newFolderName.trim(), projectId, parentId: currentFolderId, type: "passwords" }),
      });
      const json = await res.json() as { ok: boolean; data?: FolderItem };
      if (json.ok && json.data) {
        setFolders(prev => [...prev, json.data!].sort((a, b) => a.name.localeCompare(b.name)));
        setNewFolderName("");
        setShowNewFolder(false);
      }
    } finally {
      setCreatingFolder(false);
    }
  }

  async function openDetail(entry: PasswordEntry) {
    setDetailEntry(null);
    setLoadingDetail(true);
    setRevealPassword(false);
    setRevealTotp(false);
    setConfirmDelete(false);
    setDialog("view");
    try {
      const token = getToken();
      const res = await fetch(`/api/passwords/${entry.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { ok: boolean; data?: PasswordDetail };
      if (json.ok && json.data) setDetailEntry(json.data);
    } finally {
      setLoadingDetail(false);
    }
  }

  function startEdit() {
    if (!detailEntry) return;
    setForm({
      title: detailEntry.title,
      username: detailEntry.username ?? "",
      password: detailEntry.password,
      totp: detailEntry.totp ?? "",
      url: detailEntry.url ?? "",
      notes: detailEntry.notes ?? "",
    });
    setRevealFormPassword(false);
    setDialog("edit");
  }

  function openNew() {
    setForm(BLANK_FORM);
    setRevealFormPassword(false);
    setDialog("new");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const token = getToken();
      if (dialog === "new") {
        const res = await fetch("/api/passwords", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: form.title,
            username: form.username || undefined,
            password: form.password,
            totp: form.totp || undefined,
            url: form.url || undefined,
            notes: form.notes || undefined,
            projectId,
            folderId: currentFolderId,
          }),
        });
        const json = await res.json() as { ok: boolean; data?: PasswordEntry };
        if (json.ok && json.data) {
          setEntries(prev => [...prev, json.data!].sort((a, b) => a.title.localeCompare(b.title)));
          setDialog(null);
        }
      } else if (dialog === "edit" && detailEntry) {
        const res = await fetch(`/api/passwords/${detailEntry.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: form.title,
            username: form.username || null,
            password: form.password,
            totp: form.totp || null,
            url: form.url || null,
            notes: form.notes || null,
          }),
        });
        const json = await res.json() as { ok: boolean; data?: PasswordDetail };
        if (json.ok && json.data) {
          setEntries(prev => prev.map(e => e.id === json.data!.id
            ? { ...e, title: json.data!.title, username: json.data!.username, url: json.data!.url, last_change_date: json.data!.last_change_date, updated_at: json.data!.updated_at }
            : e,
          ));
          setDetailEntry(json.data);
          setRevealPassword(false);
          setRevealTotp(false);
          setDialog("view");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!detailEntry) return;
    const token = getToken();
    const res = await fetch(`/api/passwords/${detailEntry.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { ok: boolean };
    if (json.ok) {
      setEntries(prev => prev.filter(e => e.id !== detailEntry.id));
      setDialog(null);
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }

  async function copyDecryptedField(entryId: string, field: "password" | "totp") {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`/api/passwords/${entryId}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json() as { ok: boolean; data?: PasswordDetail };
    if (!json.ok || !json.data) return;
    if (field === "password") {
      copyToClipboard(json.data.password, `row-password-${entryId}`);
    } else if (field === "totp" && json.data.totp) {
      try { copyToClipboard(await computeTOTP(json.data.totp), `row-totp-${entryId}`); } catch {}
    }
  }

  // Drag handlers
  function onDragStart(type: "entry" | "folder", id: string) { draggedItem.current = { type, id }; }
  function onDragEnd() { draggedItem.current = null; setDropTarget(null); }
  function onCrumbDragOver(e: React.DragEvent, crumbId: string | null) { e.preventDefault(); setDropTarget(crumbId ?? "root"); }
  function onCrumbDragLeave() { setDropTarget(null); }

  async function moveEntry(entryId: string, targetFolderId: string | null) {
    const token = getToken();
    await fetch(`/api/passwords/${entryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ folderId: targetFolderId }),
    });
    await loadContents();
  }

  async function moveFolder(folderId: string, targetParentId: string | null) {
    const token = getToken();
    await fetch(`/api/folders/${folderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentId: targetParentId }),
    });
    await loadContents();
  }

  async function onCrumbDrop(e: React.DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    setDropTarget(null);
    const item = draggedItem.current;
    if (!item) return;
    if (item.type === "entry") await moveEntry(item.id, targetFolderId);
    else {
      if (item.id === targetFolderId) return;
      await moveFolder(item.id, targetFolderId);
    }
  }

  function setField<K extends keyof EntryForm>(key: K, value: EntryForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // ── JSX ──────────────────────────────────────────────────────────────────

  function renderTable(folderRows: FolderItem[], entryRows: PasswordEntry[]) {
    const [s0, s1, s2, s3, s4] = colSizes;
    return (
      <div className="rounded-md border overflow-hidden">
        {/* Header row with resizable column handles */}
        <div className="flex items-center bg-muted/50 border-b h-10">
          <div className="w-10 shrink-0" />
          <ResizablePanelGroup direction="horizontal" className="flex-1 h-full" onLayout={setColSizes}>
            <ResizablePanel defaultSize={28} minSize={12}>
              <div className="flex items-center h-full px-3 text-xs font-medium text-muted-foreground">Name</div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={18} minSize={14}>
              <div className="flex items-center h-full px-1 text-xs font-medium text-muted-foreground"></div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={20} minSize={10}>
              <div className="flex items-center h-full px-3 text-xs font-medium text-muted-foreground">Username</div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={18} minSize={10}>
              <div className="flex items-center h-full px-3 text-xs font-medium text-muted-foreground">URL</div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={16} minSize={10}>
              <div className="flex items-center h-full px-3 text-xs font-medium text-muted-foreground">Last changed</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Folder rows */}
        {folderRows.map(folder => {
          const isDropTarget = dropTarget === folder.id;
          return (
            <div
              key={folder.id}
              draggable
              onDragStart={() => onDragStart("folder", folder.id)}
              onDragEnd={onDragEnd}
              onClick={() => enterFolder(folder)}
              onDragOver={e => {
                if (draggedItem.current?.id === folder.id) return;
                e.preventDefault();
                setDropTarget(folder.id);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={async e => {
                e.preventDefault();
                setDropTarget(null);
                const item = draggedItem.current;
                if (!item || item.id === folder.id) return;
                if (item.type === "entry") await moveEntry(item.id, folder.id);
                else await moveFolder(item.id, folder.id);
              }}
              className={`flex items-center border-b h-10 cursor-pointer select-none transition-colors hover:bg-muted/40 ${isDropTarget ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : ""}`}
            >
              <div className="w-10 shrink-0" />
              <div className="flex-1 flex min-w-0">
                <div style={{ width: `${s0}%` }} className="flex items-center px-3 overflow-hidden">
                  <Folder className={`h-4 w-4 shrink-0 mr-2 ${isDropTarget ? "text-primary" : "text-primary/70"}`} />
                  <span className="text-sm font-medium truncate">{folder.name}</span>
                </div>
                <div style={{ width: `${s1}%` }} />
                <div style={{ width: `${s2}%` }} />
                <div style={{ width: `${s3}%` }} />
                <div style={{ width: `${s4}%` }} />
              </div>
            </div>
          );
        })}

        {/* Entry rows */}
        {entryRows.map(entry => (
          <div
            key={entry.id}
            draggable
            onDragStart={() => onDragStart("entry", entry.id)}
            onDragEnd={onDragEnd}
            className="flex items-center border-b last:border-b-0 h-10 select-none hover:bg-muted/40 transition-colors"
          >
            <div className="w-10 shrink-0 px-3" onClick={e => e.stopPropagation()}>
              <Checkbox
                checked={selectedEntries.has(entry.id)}
                onCheckedChange={checked => {
                  setSelectedEntries(prev => {
                    const next = new Set(prev);
                    if (checked) next.add(entry.id);
                    else next.delete(entry.id);
                    return next;
                  });
                }}
              />
            </div>
            <div className="flex-1 flex min-w-0">
              {/* Name */}
              <div style={{ width: `${s0}%` }} className="flex items-center px-3 overflow-hidden cursor-pointer" onClick={() => openDetail(entry)}>
                <Lock className="h-4 w-4 shrink-0 mr-2 text-muted-foreground/60" />
                <span className="text-sm truncate">{entry.title}</span>
              </div>
              {/* Actions — after Name, before Username */}
              <div style={{ width: `${s1}%` }} className="flex items-center px-1 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    title="Copy username" disabled={!entry.username}
                    onClick={() => entry.username && copyToClipboard(entry.username, `row-username-${entry.id}`)}
                  >
                    {copiedField === `row-username-${entry.id}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <User className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    title="Copy password"
                    onClick={() => copyDecryptedField(entry.id, "password")}
                  >
                    {copiedField === `row-password-${entry.id}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Key className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    title="Copy TOTP"
                    onClick={() => copyDecryptedField(entry.id, "totp")}
                  >
                    {copiedField === `row-totp-${entry.id}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Clock className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    title="Open URL" disabled={!entry.url} asChild={!!entry.url}
                  >
                    {entry.url ? (
                      <a href={entry.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              {/* Username */}
              <div style={{ width: `${s2}%` }} className="flex items-center px-3 overflow-hidden">
                <span className="text-sm text-muted-foreground truncate">{entry.username ?? ""}</span>
              </div>
              {/* URL */}
              <div style={{ width: `${s3}%` }} className="flex items-center px-3 overflow-hidden">
                <span className="text-sm text-muted-foreground truncate">{entry.url ? formatHostname(entry.url) : ""}</span>
              </div>
              {/* Last changed */}
              <div style={{ width: `${s4}%` }} className="flex items-center px-3 overflow-hidden">
                <span className="text-sm text-muted-foreground truncate">{formatRelativeTime(entry.last_change_date)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search entries…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowNewFolder(true)}>
          <FolderPlus className="h-3.5 w-3.5" />
          New folder
        </Button>
        <Button size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" />
          New entry
        </Button>
      </div>

      {/* Table */}
      <div className="px-6 pb-6">
        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No entries found</p>
            </div>
          ) : renderTable([], searchResults)
        ) : folders.length === 0 && entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Lock className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No entries in this folder</p>
          </div>
        ) : renderTable(folders, entries)}
      </div>

      {/* New folder dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateFolder} className="flex flex-col gap-3">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              autoFocus
              required
            />
            <Button type="submit" disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder ? "Creating…" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Entry dialog — view / edit / new */}
      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-md">

          {/* ── View mode ───────────────────────────────────────────────── */}
          {dialog === "view" && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between pr-8">
                  <DialogTitle className="leading-snug">{detailEntry?.title ?? "…"}</DialogTitle>
                  {!loadingDetail && detailEntry && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 -mt-0.5"
                      onClick={startEdit}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </DialogHeader>

              {loadingDetail ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : detailEntry ? (
                <div className="flex flex-col gap-4 pt-1">

                  {/* Username */}
                  {detailEntry.username && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Username</span>
                      <div className="flex items-center gap-1">
                        <span className="flex-1 text-sm break-all">{detailEntry.username}</span>
                        <CopyBtn text={detailEntry.username} field="username" copied={copiedField} onCopy={copyToClipboard} />
                      </div>
                    </div>
                  )}

                  {/* Password */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</span>
                    <div className="flex items-center gap-1">
                      <span className="flex-1 font-mono text-sm break-all">
                        {revealPassword ? detailEntry.password : "•".repeat(Math.min(detailEntry.password.length, 24))}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setRevealPassword(p => !p)}>
                        {revealPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <CopyBtn text={detailEntry.password} field="password" copied={copiedField} onCopy={copyToClipboard} />
                    </div>
                  </div>

                  {/* TOTP */}
                  {detailEntry.totp && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">TOTP</span>
                      <div className="flex items-center gap-1">
                        <div className="flex-1">
                          {revealTotp
                            ? <TOTPDisplay secret={detailEntry.totp} />
                            : <span className="font-mono text-lg tracking-widest text-muted-foreground">••••••</span>}
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setRevealTotp(p => !p)}>
                          {revealTotp ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={async () => {
                            if (!detailEntry.totp) return;
                            try { copyToClipboard(await computeTOTP(detailEntry.totp), "totp"); } catch {}
                          }}
                        >
                          {copiedField === "totp" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* URL */}
                  {detailEntry.url && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL</span>
                      <div className="flex items-center gap-1">
                        <a
                          href={detailEntry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-sm text-primary truncate hover:underline"
                        >
                          {detailEntry.url}
                        </a>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
                          <a href={detailEntry.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <CopyBtn text={detailEntry.url} field="url" copied={copiedField} onCopy={copyToClipboard} />
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {detailEntry.notes && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</span>
                      <div className="flex items-start gap-1">
                        <p className="flex-1 text-sm whitespace-pre-wrap">{detailEntry.notes}</p>
                        <CopyBtn text={detailEntry.notes} field="notes" copied={copiedField} onCopy={copyToClipboard} />
                      </div>
                    </div>
                  )}

                  {/* Last changed */}
                  <div className="flex flex-col gap-1 border-t pt-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last changed</span>
                    <span className="text-sm text-muted-foreground">{formatRelativeTime(detailEntry.last_change_date)}</span>
                  </div>

                  {/* Delete */}
                  {confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-destructive">Delete this entry?</span>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                      <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
                    </div>
                  ) : (
                    <DialogFooter className="pt-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mr-auto text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </DialogFooter>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-destructive">Failed to load entry.</div>
              )}
            </>
          )}

          {/* ── New / Edit form ──────────────────────────────────────────── */}
          {(dialog === "new" || dialog === "edit") && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog === "new" ? "New entry" : `Edit: ${detailEntry?.title ?? ""}`}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-1">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-title">Title</Label>
                  <Input
                    id="e-title"
                    value={form.title}
                    onChange={e => setField("title", e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-username">
                    Username <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="e-username"
                    value={form.username}
                    onChange={e => setField("username", e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-password">Password</Label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Input
                        id="e-password"
                        type={revealFormPassword ? "text" : "password"}
                        value={form.password}
                        onChange={e => setField("password", e.target.value)}
                        required
                        className="pr-9 font-mono"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full w-9"
                        onClick={() => setRevealFormPassword(p => !p)}
                      >
                        {revealFormPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setField("password", generatePassword())}
                      title="Generate password"
                    >
                      <Shuffle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-totp">
                    TOTP Secret <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="e-totp"
                    value={form.totp}
                    onChange={e => setField("totp", e.target.value)}
                    placeholder="JBSWY3DPEHPK3PXP"
                    className="font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-url">
                    URL <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="e-url"
                    type="url"
                    value={form.url}
                    onChange={e => setField("url", e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="e-notes">
                    Notes <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="e-notes"
                    value={form.notes}
                    onChange={e => setField("notes", e.target.value)}
                    rows={3}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDialog(dialog === "edit" ? "view" : null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}

        </DialogContent>
      </Dialog>

    </div>
  );
}
