import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router-dom";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";
import { Folder, FileText, House, Plus, FolderPlus, Search, X, Download, Upload, Image, FileCode, FileArchive, File, Music, Trash2, Pencil, Link, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ResizableTable, ResizableTableRow } from "@/components/ui/resizable-table";
import { Badge } from "@/components/ui/badge";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { UserProfileCard } from "@/components/UserProfileCard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface FolderItem {
  id: string;
  name: string;
  project_id: string;
  parent_id: string | null;
  created_at: string;
}

type Role = "viewer" | "editor" | "admin" | "owner";

interface DocItem {
  id: string;
  title: string;
  folder_id: string | null;
  updated_at: string;
  author_id?: string;
  author_name?: string;
  author_role?: Role | null;
  is_home?: number;
}

interface FileItem {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  folder_id: string | null;
  uploaded_by: string;
  created_at: string;
  uploader_name?: string;
  uploader_role?: Role | null;
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <Image className={className} />;
  if (mimeType.startsWith("audio/")) return <Music className={className} />;
  if (mimeType === "application/json" || mimeType.startsWith("text/")) return <FileCode className={className} />;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip") || mimeType.includes("archive")) return <FileArchive className={className} />;
  return <File className={className} />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BreadcrumbEntry {
  id: string | null;
  name: string;
}

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

const ROLE_LABELS: Record<Role, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
  owner: "Owner",
};

function RoleBadge({ role }: { role: Role }) {
  const variants: Record<Role, string> = {
    owner: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    admin: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    editor: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    viewer: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={`shrink-0 text-xs font-medium ${variants[role]}`}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

interface Props {
  projectId: string;
  projectName: string;
  myRole?: string | null;
  aiEnabled?: boolean;
  onDocCreated: (doc: DocItem) => void;
}

export function FileManager({ projectId, projectName, myRole, aiEnabled, onDocCreated }: Props) {
  const canEdit = myRole === "editor" || myRole === "admin" || myRole === "owner";
  const navigate = useNavigate();
  const { toast } = useToast();
  const location = useLocation();
  const { setBreadcrumbs } = useOutletContext<DocsLayoutContext>();

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const initialPath: BreadcrumbEntry[] = location.state?.restorePath ?? [{ id: null, name: projectName }];
  const [path, setPath] = useState<BreadcrumbEntry[]>(initialPath);
  const currentFolderId = path[path.length - 1].id;

  // Sync path from browser history (handles back/forward navigation)
  useEffect(() => {
    const restored = location.state?.restorePath;
    setPath(restored ?? [{ id: null, name: projectName }]);
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const lastCheckedDocIndex = useRef<number | null>(null);
  const lastCheckedFileIndex = useRef<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ type: "folder" | "doc" | "file"; id: string; currentName: string } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [contextDeleteTarget, setContextDeleteTarget] = useState<{ type: "folder" | "doc" | "file"; id: string; name: string } | null>(null);
  const [contextDeleting, setContextDeleting] = useState(false);
  const [folderCounts, setFolderCounts] = useState<Map<string, { files: number; folders: number }>>(new Map());

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DocItem[] | null>(null);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);

  const [loading, setLoading] = useState(true);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [summaryDoc, setSummaryDoc] = useState<DocItem | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // internal drag-to-reorder state
  const draggedItem = useRef<{ type: "doc" | "folder" | "file"; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);

  // external file drop state
  const [externalDragOver, setExternalDragOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  useEffect(() => {
    loadContents();
  }, [currentFolderId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (folders.length === 0) { setFolderCounts(new Map()); return; }
    const token = getToken();
    if (!token) return;
    fetch(`/api/folders/counts?projectId=${projectId}&type=docs`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json() as Promise<{ ok: boolean; data?: Record<string, { docs: number; folders: number }> }>)
      .then(json => {
        if (!json.ok || !json.data) return;
        const next = new Map<string, { files: number; folders: number }>();
        for (const folder of folders) {
          const c = json.data[folder.id];
          if (c) next.set(folder.id, { files: c.docs, folders: c.folders });
        }
        setFolderCounts(next);
      })
      .catch(() => {});
  }, [folders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      const folderParam = currentFolderId ? `&rootFolderId=${currentFolderId}` : "";
      const res = await fetch(`/api/docs?projectId=${projectId}&q=${encodeURIComponent(searchQuery.trim())}${folderParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { ok: boolean; data?: DocItem[] };
      if (json.ok && json.data) setSearchResults(json.data);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, projectId, currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync folder path to layout breadcrumbs
  useEffect(() => {
    setBreadcrumbs(path.map((crumb, i) => {
      const crumbKey = crumb.id ?? "root";
      const isLast = i === path.length - 1;
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

  async function loadContents() {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => {
      setLoading(true);
      setFolders([]);
      setDocs([]);
      setFiles([]);
    }, 150);

    const token = getToken();
    if (!token) return;

    const folderParam = currentFolderId ? `&parentId=${currentFolderId}` : "";
    const folderIdParam = currentFolderId ? `&folderId=${currentFolderId}` : "&folderId=";

    const [foldersRes, docsRes, filesRes] = await Promise.all([
      fetch(`/api/folders?projectId=${projectId}&type=docs${folderParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`/api/docs?projectId=${projectId}${folderIdParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`/api/files?projectId=${projectId}${folderIdParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const foldersJson = await foldersRes.json() as { ok: boolean; data?: FolderItem[] };
    const docsJson = await docsRes.json() as { ok: boolean; data?: DocItem[] };
    const filesJson = await filesRes.json() as { ok: boolean; data?: FileItem[] };

    if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
    if (foldersJson.ok && foldersJson.data) setFolders(foldersJson.data);
    if (docsJson.ok && docsJson.data) setDocs(docsJson.data);
    if (filesJson.ok && filesJson.data) setFiles(filesJson.data);
    setLoading(false);
  }

  function enterFolder(folder: FolderItem) {
    const newPath = [...path, { id: folder.id, name: folder.name }];
    navigate(location.pathname, { state: { restorePath: newPath } });
  }

  function navigateToCrumb(index: number) {
    const newPath = path.slice(0, index + 1);
    navigate(location.pathname, { state: { restorePath: newPath } });
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
        body: JSON.stringify({ name: newFolderName.trim(), projectId, parentId: currentFolderId, type: "docs" }),
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

  async function handleNewDoc() {
    if (creatingDoc) return;
    setCreatingDoc(true);
    try {
      const token = getToken();
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: "Untitled", content: "", projectId, folderId: currentFolderId }),
      });
      const json = await res.json() as { ok: boolean; data?: DocItem & { id: string } };
      if (json.ok && json.data) {
        onDocCreated(json.data);
        navigate(`/projects/${projectId}/docs/${json.data.id}`, { state: { isNew: true, folderPath: path } });
      }
    } finally {
      setCreatingDoc(false);
    }
  }

  async function moveDoc(docId: string, targetFolderId: string | null) {
    const token = getToken();
    await fetch(`/api/docs/${docId}`, {
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

  async function downloadDoc(doc: DocItem) {
    const token = getToken();
    const res = await fetch(`/api/docs/${doc.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { ok: boolean; data?: { content: string; title: string } };
    if (!json.ok || !json.data) return;
    const content = json.data.content ?? "";
    const title = json.data.title || "Untitled";
    const filename = `${title.replace(/[<>:"/\\|?*]/g, "_")}.md`;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadDoc(e: React.MouseEvent, doc: DocItem) {
    e.stopPropagation();
    await downloadDoc(doc);
  }

  async function handleSummarize(e: React.MouseEvent, doc: DocItem) {
    e.stopPropagation();
    setSummaryDoc(doc);
    setSummary(null);
    setSummarizing(true);
    try {
      const token = getToken();
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ docId: doc.id }),
      });
      const json = await res.json() as { ok: boolean; data?: { summary: string } };
      if (json.ok && json.data) setSummary(json.data.summary);
      else setSummary("Failed to generate summary.");
    } catch {
      setSummary("Failed to generate summary.");
    } finally {
      setSummarizing(false);
    }
  }

  function openFile(file: FileItem) {
    navigate(`/projects/${projectId}/files/${file.id}`, { state: { folderPath: path } });
  }

  async function downloadFile(file: FileItem) {
    const token = getToken();
    const res = await fetch(`/api/files/${file.id}/content`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function moveFile(fileId: string, targetFolderId: string | null) {
    const token = getToken();
    await fetch(`/api/files/${fileId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ folderId: targetFolderId }),
    });
    await loadContents();
  }

  async function handleDeleteConfirmed() {
    if (deleting) return;
    setDeleting(true);
    setDeleteConfirmOpen(false);
    const token = getToken();
    try {
      await Promise.all([
        ...[...selectedDocs].map(id =>
          fetch(`/api/docs/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
        ),
        ...[...selectedFiles].map(id =>
          fetch(`/api/files/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
        ),
      ]);
      setDocs(prev => prev.filter(d => !selectedDocs.has(d.id)));
      setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
      setSelectedDocs(new Set());
      setSelectedFiles(new Set());
    } finally {
      setDeleting(false);
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget || !renameName.trim() || renaming) return;
    setRenaming(true);
    const token = getToken();
    try {
      if (renameTarget.type === "folder") {
        await fetch(`/api/folders/${renameTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: renameName.trim() }),
        });
        setFolders(prev => prev.map(f => f.id === renameTarget.id ? { ...f, name: renameName.trim() } : f));
      } else if (renameTarget.type === "doc") {
        await fetch(`/api/docs/${renameTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: renameName.trim() }),
        });
        setDocs(prev => prev.map(d => d.id === renameTarget.id ? { ...d, title: renameName.trim() } : d));
      } else {
        await fetch(`/api/files/${renameTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: renameName.trim() }),
        });
        setFiles(prev => prev.map(f => f.id === renameTarget.id ? { ...f, name: renameName.trim() } : f));
      }
      setRenameTarget(null);
    } finally {
      setRenaming(false);
    }
  }

  async function handleContextDelete() {
    if (!contextDeleteTarget || contextDeleting) return;
    setContextDeleting(true);
    const token = getToken();
    const { type, id } = contextDeleteTarget;
    try {
      if (type === "folder") {
        await fetch(`/api/folders/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        setFolders(prev => prev.filter(f => f.id !== id));
      } else if (type === "doc") {
        await fetch(`/api/docs/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        setDocs(prev => prev.filter(d => d.id !== id));
      } else {
        await fetch(`/api/files/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        setFiles(prev => prev.filter(f => f.id !== id));
      }
      setContextDeleteTarget(null);
    } finally {
      setContextDeleting(false);
    }
  }

  const uploadFileAndCreateDoc = useCallback(async (file: File) => {
    const token = getToken();
    if (!token) return;

    setUploadingCount(c => c + 1);
    try {
      // .md files → import content as a new document
      if (file.name.endsWith(".md")) {
        const content = await file.text();
        const title = file.name.slice(0, -3) || "Untitled";
        const docRes = await fetch("/api/docs", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title, content, projectId, folderId: currentFolderId }),
        });
        const docJson = await docRes.json() as { ok: boolean; data?: DocItem & { id: string } };
        if (docJson.ok && docJson.data) {
          onDocCreated(docJson.data);
          setDocs(prev => [...prev, docJson.data!].sort((a, b) => a.title.localeCompare(b.title)));
        }
        return;
      }

      // Everything else → upload as a native file entry
      const form = new FormData();
      form.append("file", file);
      form.append("projectId", projectId);
      if (currentFolderId) form.append("folderId", currentFolderId);
      const uploadRes = await fetch("/api/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const uploadJson = await uploadRes.json() as { ok: boolean; data?: FileItem };
      if (uploadJson.ok && uploadJson.data) {
        setFiles(prev => [...prev, uploadJson.data!].sort((a, b) => a.name.localeCompare(b.name)));
      }
    } finally {
      setUploadingCount(c => c - 1);
    }
  }, [projectId, currentFolderId, onDocCreated]);

  const handleExternalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setExternalDragOver(false);
    if (draggedItem.current) return; // internal drag, not our concern
    Array.from(e.dataTransfer.files).forEach(uploadFileAndCreateDoc);
  }, [uploadFileAndCreateDoc]);

  function onDragStart(e: React.DragEvent, type: "doc" | "folder" | "file", id: string) {
    draggedItem.current = { type, id };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function onDragEnd() {
    draggedItem.current = null;
    setDropTarget(null);
  }

  function onCrumbDragOver(e: React.DragEvent, crumbId: string | null) {
    e.preventDefault();
    setDropTarget(crumbId ?? "root");
  }

  function onCrumbDragLeave() {
    setDropTarget(null);
  }

  async function onCrumbDrop(e: React.DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    setDropTarget(null);
    const item = draggedItem.current;
    if (!item) return;
    if (item.type === "doc") await moveDoc(item.id, targetFolderId);
    else if (item.type === "file") await moveFile(item.id, targetFolderId);
    else {
      if (item.id === targetFolderId) return;
      await moveFolder(item.id, targetFolderId);
    }
  }

  const FILE_COLUMNS = [
    { label: "Name", defaultSize: 0, minWidth: 200, maxWidth: 500 },
    { label: "Created by", defaultSize: 0, minWidth: 150, maxWidth: 400 },
    { label: "Size", defaultSize: 15, minSize: 8 },
    { label: "Last updated", defaultSize: 25, minSize: 12 },
  ];

  function renderTable(folderRows: FolderItem[], docRows: DocItem[], fileRows: FileItem[] = []) {
    return (
      <ResizableTable columns={FILE_COLUMNS} checkboxColumn={canEdit} storageKey="file-columns">
        <>
          {folderRows.map(folder => {
            const isDropTarget = dropTarget === folder.id;
            const folderRow = (
              <ResizableTableRow
                columns={FILE_COLUMNS}
                draggable
                  onDragStart={e => onDragStart(e, "folder", folder.id)}
                  onDragEnd={onDragEnd}
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
                    if (item.type === "doc") await moveDoc(item.id, folder.id);
                    else if (item.type === "file") await moveFile(item.id, folder.id);
                    else await moveFolder(item.id, folder.id);
                  }}
                  className={`cursor-pointer ${isDropTarget ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : ""}`}
                  cells={[
                    {
                      content: (
                        <div className="group flex items-center w-full min-w-0">
                          <Folder className={`h-4 w-4 shrink-0 mr-2 ${isDropTarget ? "text-primary" : "text-primary/70"}`} />
                          <span className="text-sm font-medium truncate">{folder.name}</span>
                          {folderCounts.has(folder.id) && (() => {
                            const c = folderCounts.get(folder.id)!;
                            const parts = [];
                            if (c.files > 0) parts.push(`${c.files} ${c.files === 1 ? "file" : "files"}`);
                            if (c.folders > 0) parts.push(`${c.folders} ${c.folders === 1 ? "folder" : "folders"}`);
                            return parts.length > 0 ? (
                              <Badge variant="outline" className="ml-2 shrink-0 text-xs text-muted-foreground">
                                {parts.join(", ")}
                              </Badge>
                            ) : null;
                          })()}
                          {canEdit && (
                            <button
                              onClick={e => { e.stopPropagation(); setRenameTarget({ type: "folder", id: folder.id, currentName: folder.name }); setRenameName(folder.name); }}
                              className="ml-1.5 shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-opacity"
                              title="Rename"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ),
                      onClick: () => enterFolder(folder),
                    },
                    { content: null },
                    { content: null },
                    { content: null },
                  ]}
                />
            );
            if (!canEdit) return <div key={folder.id}>{folderRow}</div>;
            return (
              <ContextMenu key={folder.id}>
                <ContextMenuTrigger asChild><div>{folderRow}</div></ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => { setRenameTarget({ type: "folder", id: folder.id, currentName: folder.name }); setRenameName(folder.name); }}>
                    <Pencil />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onClick={() => setContextDeleteTarget({ type: "folder", id: folder.id, name: folder.name })}>
                    <Trash2 />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
            })}
          {docRows.map((doc, docIdx) => {
            const isHome = doc.is_home === 1;
            const navToDoc = () => navigate(`/projects/${projectId}/docs/${doc.id}`, { state: { folderPath: path } });
            const docRow = (
              <ResizableTableRow
                columns={FILE_COLUMNS}
                draggable
                  onDragStart={e => onDragStart(e, "doc", doc.id)}
                  onDragEnd={onDragEnd}
                  checkboxCell={!canEdit ? undefined : isHome ? null : (
                    <Checkbox
                      checked={selectedDocs.has(doc.id)}
                      onClick={(e) => {
                        const willBeChecked = !selectedDocs.has(doc.id);
                        if (e.shiftKey && lastCheckedDocIndex.current !== null) {
                          const from = Math.min(lastCheckedDocIndex.current, docIdx);
                          const to = Math.max(lastCheckedDocIndex.current, docIdx);
                          setSelectedDocs(prev => {
                            const next = new Set(prev);
                            for (let i = from; i <= to; i++) {
                              if (docRows[i].is_home === 1) continue;
                              if (willBeChecked) next.add(docRows[i].id);
                              else next.delete(docRows[i].id);
                            }
                            return next;
                          });
                        } else {
                          setSelectedDocs(prev => {
                            const next = new Set(prev);
                            if (willBeChecked) next.add(doc.id);
                            else next.delete(doc.id);
                            return next;
                          });
                        }
                        lastCheckedDocIndex.current = docIdx;
                      }}
                    />
                  )}
                  cells={[
                    {
                      content: (
                        <div className="group flex items-center w-full min-w-0">
                          {isHome
                            ? <House className="h-4 w-4 shrink-0 mr-2 text-primary/70" />
                            : <FileText className="h-4 w-4 shrink-0 mr-2 text-muted-foreground/60" />
                          }
                          <span className="text-sm truncate">{doc.title || "Untitled"}</span>
                          {canEdit && (
                            <button
                              onClick={e => { e.stopPropagation(); setRenameTarget({ type: "doc", id: doc.id, currentName: doc.title || "Untitled" }); setRenameName(doc.title || "Untitled"); }}
                              className="ml-1.5 shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-opacity"
                              title="Rename"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ),
                      className: "px-3 cursor-pointer",
                      onClick: navToDoc,
                    },
                    {
                      content: doc.author_id && doc.author_name ? (
                        <UserProfileCard userId={doc.author_id} name={doc.author_name}>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground truncate cursor-pointer hover:text-foreground transition-colors">
                            {doc.author_name}
                            {doc.author_role && <RoleBadge role={doc.author_role} />}
                          </div>
                        </UserProfileCard>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                          {doc.author_name ?? ""}
                          {doc.author_role && <RoleBadge role={doc.author_role} />}
                        </div>
                      ),
                    },
                    { content: null },
                    {
                      content: (
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="text-sm text-muted-foreground truncate">{formatRelativeTime(doc.updated_at)}</span>
                          <div className="flex items-center gap-0.5">
                            {aiEnabled && (
                              <button
                                onClick={e => handleSummarize(e, doc)}
                                className="shrink-0 p-1 rounded text-violet-400 hover:text-violet-300 hover:bg-muted"
                                title="Summarise with AI"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={e => handleDownloadDoc(e, doc)}
                              className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                              title="Download as markdown"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />
            );
            return (
              <ContextMenu key={doc.id}>
                <ContextMenuTrigger asChild><div>{docRow}</div></ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/projects/${projectId}/docs/${doc.id}`); toast({ title: "Link copied" }); }}>
                    <Link />
                    Copy link
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => downloadDoc(doc)}>
                    <Download />
                    Download
                  </ContextMenuItem>
                  {canEdit && <ContextMenuSeparator />}
                  {canEdit && (
                    <ContextMenuItem onClick={() => { setRenameTarget({ type: "doc", id: doc.id, currentName: doc.title || "Untitled" }); setRenameName(doc.title || "Untitled"); }}>
                      <Pencil />
                      Rename
                    </ContextMenuItem>
                  )}
                  {canEdit && !isHome && (
                    <ContextMenuItem variant="destructive" onClick={() => setContextDeleteTarget({ type: "doc", id: doc.id, name: doc.title || "Untitled" })}>
                      <Trash2 />
                      Delete
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          {fileRows.map((file, fileIdx) => {
            const fileRow = (
              <ResizableTableRow
                columns={FILE_COLUMNS}
                draggable
                onDragStart={e => onDragStart(e, "file", file.id)}
                onDragEnd={onDragEnd}
                checkboxCell={canEdit ? (
                  <Checkbox
                    checked={selectedFiles.has(file.id)}
                    onClick={(e) => {
                      const willBeChecked = !selectedFiles.has(file.id);
                      if (e.shiftKey && lastCheckedFileIndex.current !== null) {
                        const from = Math.min(lastCheckedFileIndex.current, fileIdx);
                        const to = Math.max(lastCheckedFileIndex.current, fileIdx);
                        setSelectedFiles(prev => {
                          const next = new Set(prev);
                          for (let i = from; i <= to; i++) {
                            if (willBeChecked) next.add(fileRows[i].id);
                            else next.delete(fileRows[i].id);
                          }
                          return next;
                        });
                      } else {
                        setSelectedFiles(prev => {
                          const next = new Set(prev);
                          if (willBeChecked) next.add(file.id);
                          else next.delete(file.id);
                          return next;
                        });
                      }
                      lastCheckedFileIndex.current = fileIdx;
                    }}
                  />
                ) : undefined}
                cells={[
                  {
                    content: (
                      <div className="group flex items-center w-full min-w-0">
                        <FileIcon mimeType={file.mime_type} className="h-4 w-4 shrink-0 mr-2 text-muted-foreground/60" />
                        <span className="text-sm truncate">{file.name}</span>
                        {canEdit && (
                          <button
                            onClick={e => { e.stopPropagation(); setRenameTarget({ type: "file", id: file.id, currentName: file.name }); setRenameName(file.name); }}
                            className="ml-1.5 shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-opacity"
                            title="Rename"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ),
                    className: "px-3 cursor-pointer",
                    onClick: () => openFile(file),
                  },
                  {
                    content: file.uploaded_by && file.uploader_name ? (
                      <UserProfileCard userId={file.uploaded_by} name={file.uploader_name}>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground truncate cursor-pointer hover:text-foreground transition-colors">
                          {file.uploader_name}
                          {file.uploader_role && <RoleBadge role={file.uploader_role} />}
                        </div>
                      </UserProfileCard>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                        {file.uploader_name ?? ""}
                        {file.uploader_role && <RoleBadge role={file.uploader_role} />}
                      </div>
                    ),
                  },
                  {
                    content: <span className="text-sm text-muted-foreground">{formatBytes(file.size)}</span>,
                  },
                  {
                    content: (
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="text-sm text-muted-foreground truncate">{formatRelativeTime(file.created_at)}</span>
                        <button
                          onClick={e => { e.stopPropagation(); downloadFile(file); }}
                          className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            );
            return (
              <ContextMenu key={file.id}>
                <ContextMenuTrigger asChild><div>{fileRow}</div></ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/projects/${projectId}/files/${file.id}`); toast({ title: "Link copied" }); }}>
                    <Link />
                    Copy link
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => downloadFile(file)}>
                    <Download />
                    Download
                  </ContextMenuItem>
                  {canEdit && <ContextMenuSeparator />}
                  {canEdit && (
                    <ContextMenuItem onClick={() => { setRenameTarget({ type: "file", id: file.id, currentName: file.name }); setRenameName(file.name); }}>
                      <Pencil />
                      Rename
                    </ContextMenuItem>
                  )}
                  {canEdit && (
                    <ContextMenuItem variant="destructive" onClick={() => setContextDeleteTarget({ type: "file", id: file.id, name: file.name })}>
                      <Trash2 />
                      Delete
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </>
      </ResizableTable>
    );
  }

  return (
    <div
      className="relative flex min-h-full flex-col"
      onDragEnter={e => { if (!draggedItem.current && e.dataTransfer.types.includes("Files")) setExternalDragOver(true); }}
      onDragOver={e => { if (!draggedItem.current && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setExternalDragOver(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setExternalDragOver(false); }}
      onDrop={handleExternalDrop}
    >
      {(externalDragOver || uploadingCount > 0) && (
        <div className="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/80 backdrop-blur-sm ring-2 ring-inset ring-primary/40">
          <Upload className="h-8 w-8 text-primary/60" />
          <p className="text-sm font-medium text-muted-foreground">
            {uploadingCount > 0 ? `Uploading ${uploadingCount} ${uploadingCount === 1 ? "file" : "files"}…` : "Drop to upload"}
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search files…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowNewFolder(true)}>
            <FolderPlus className="h-3.5 w-3.5" />
            New folder
          </Button>
        )}
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={handleNewDoc} disabled={creatingDoc}>
            <Plus className="h-3.5 w-3.5" />
            {creatingDoc ? "Creating…" : "New document"}
          </Button>
        )}
        {canEdit && (selectedDocs.size > 0 || selectedFiles.size > 0) && (
          <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setDeleteConfirmOpen(true)} disabled={deleting}>
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? "Deleting…" : `Delete (${selectedDocs.size + selectedFiles.size})`}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="px-6 pb-6">
        {loading ? (
          <div className="flex flex-col gap-1.5 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : searchResults !== null ? (
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No files found</p>
            </div>
          ) : renderTable([], searchResults)
        ) : folders.length === 0 && docs.length === 0 && files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Folder className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">This folder is empty</p>
          </div>
        ) : renderTable(folders, docs, files)}
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

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={open => { if (!open) setRenameTarget(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRename} className="flex flex-col gap-3">
            <Input
              value={renameName}
              onChange={e => setRenameName(e.target.value)}
              autoFocus
              required
            />
            <Button type="submit" disabled={renaming || !renameName.trim()}>
              {renaming ? "Renaming…" : "Rename"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedDocs.size + selectedFiles.size} {selectedDocs.size + selectedFiles.size === 1 ? "item" : "items"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action is irreversible and all data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirmed}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI summary dialog */}
      <Dialog open={!!summaryDoc} onOpenChange={open => { if (!open) { setSummaryDoc(null); setSummary(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              {summaryDoc?.title || "Document"}
            </DialogTitle>
            <DialogDescription className="sr-only">AI-generated summary</DialogDescription>
          </DialogHeader>
          <div className="text-sm leading-relaxed min-h-[60px]">
            {summarizing ? (
              <div className="space-y-2 pt-3">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-3.5 w-4/6" />
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&_ul]:my-1 [&_li]:my-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary ?? ""}</ReactMarkdown>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Context menu single-item delete confirmation */}
      <AlertDialog open={!!contextDeleteTarget} onOpenChange={open => { if (!open) setContextDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{contextDeleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is irreversible and all data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleContextDelete}
              disabled={contextDeleting}
            >
              {contextDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
