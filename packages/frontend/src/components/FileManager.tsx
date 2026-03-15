import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Folder, FileText, Plus, FolderPlus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getToken } from "@/lib/auth";

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
  author_name?: string;
  author_role?: Role | null;
}

interface BreadcrumbEntry {
  id: string | null;
  name: string;
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
  onDocCreated: (doc: DocItem) => void;
}

export function FileManager({ projectId, projectName, onDocCreated }: Props) {
  const navigate = useNavigate();

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [path, setPath] = useState<BreadcrumbEntry[]>([{ id: null, name: projectName }]);
  const currentFolderId = path[path.length - 1].id;

  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);

  // drag state
  const draggedItem = useRef<{ type: "doc" | "folder"; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);

  useEffect(() => {
    loadContents();
  }, [currentFolderId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadContents() {
    const token = getToken();
    if (!token) return;

    const folderParam = currentFolderId ? `&parentId=${currentFolderId}` : "";
    const folderIdParam = currentFolderId ? `&folderId=${currentFolderId}` : "&folderId=";

    const [foldersRes, docsRes] = await Promise.all([
      fetch(`/api/folders?projectId=${projectId}${folderParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`/api/docs?projectId=${projectId}${folderIdParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const foldersJson = await foldersRes.json() as { ok: boolean; data?: FolderItem[] };
    const docsJson = await docsRes.json() as { ok: boolean; data?: DocItem[] };

    if (foldersJson.ok && foldersJson.data) setFolders(foldersJson.data);
    if (docsJson.ok && docsJson.data) setDocs(docsJson.data);
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
        body: JSON.stringify({ name: newFolderName.trim(), projectId, parentId: currentFolderId }),
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
        navigate(`/projects/${projectId}/docs/${json.data.id}`, { state: { isNew: true } });
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

  function onDragStart(type: "doc" | "folder", id: string) {
    draggedItem.current = { type, id };
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
    if (item.type === "doc") {
      await moveDoc(item.id, targetFolderId);
    } else {
      if (item.id === targetFolderId) return; // can't move folder into itself
      await moveFolder(item.id, targetFolderId);
    }
  }

  return (
    <div className="flex flex-col">
      {/* Breadcrumbs */}
      <div className="sticky top-0 z-10 bg-background flex items-center gap-1 px-6 py-3 border-b border-border text-sm">
        {path.map((crumb, i) => {
          const isLast = i === path.length - 1;
          const crumbKey = crumb.id ?? "root";
          const isDropTarget = dropTarget === crumbKey;

          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
              <span
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  isLast
                    ? "text-foreground font-medium"
                    : "text-muted-foreground cursor-pointer hover:text-foreground hover:bg-accent"
                } ${isDropTarget ? "bg-primary/15 text-primary ring-1 ring-primary/40" : ""}`}
                onClick={() => !isLast && navigateToCrumb(i)}
                onDragOver={e => onCrumbDragOver(e, crumb.id)}
                onDragLeave={onCrumbDragLeave}
                onDrop={e => onCrumbDrop(e, crumb.id)}
              >
                {crumb.name}
              </span>
            </span>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-3">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowNewFolder(true)}>
          <FolderPlus className="h-3.5 w-3.5" />
          New folder
        </Button>
        <Button size="sm" className="gap-1.5" onClick={handleNewDoc} disabled={creatingDoc}>
          <Plus className="h-3.5 w-3.5" />
          {creatingDoc ? "Creating…" : "New document"}
        </Button>
      </div>

      {/* Table */}
      <div className="px-6 pb-6">
        {folders.length === 0 && docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Folder className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">This folder is empty</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Created by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.map(folder => {
                const isDropTarget = dropTarget === folder.id;
                return (
                  <TableRow
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
                      if (item.type === "doc") await moveDoc(item.id, folder.id);
                      else await moveFolder(item.id, folder.id);
                    }}
                    className={`cursor-pointer select-none transition-colors ${isDropTarget ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : ""}`}
                  >
                    <TableCell></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Folder className={`h-4 w-4 shrink-0 ${isDropTarget ? "text-primary" : "text-primary/70"}`} />
                        <span className="text-sm font-medium">{folder.name}</span>
                      </div>
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                );
              })}
              {docs.map(doc => (
                <TableRow
                  key={doc.id}
                  draggable
                  onDragStart={() => onDragStart("doc", doc.id)}
                  onDragEnd={onDragEnd}
                  className="cursor-pointer select-none"
                >
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedDocs.has(doc.id)}
                      onCheckedChange={checked => {
                        setSelectedDocs(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(doc.id);
                          else next.delete(doc.id);
                          return next;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell onClick={() => navigate(`/projects/${projectId}/docs/${doc.id}`)}>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      <span className="text-sm">{doc.title || "Untitled"}</span>
                    </div>
                  </TableCell>
                  <TableCell
                    className="text-sm text-muted-foreground"
                    onClick={() => navigate(`/projects/${projectId}/docs/${doc.id}`)}
                  >
                    <div className="flex items-center gap-2">
                      {doc.author_name ?? ""}
                      {doc.author_role && <RoleBadge role={doc.author_role} />}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
    </div>
  );
}
