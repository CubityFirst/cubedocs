import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router-dom";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";
import { Folder, FileText, Plus, FolderPlus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ResizableTable, ResizableTableRow } from "@/components/ui/resizable-table";
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
  onDocCreated: (doc: DocItem) => void;
}

export function FileManager({ projectId, projectName, onDocCreated }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setBreadcrumbs } = useOutletContext<DocsLayoutContext>();

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const initialPath: BreadcrumbEntry[] = location.state?.restorePath ?? [{ id: null, name: projectName }];
  const [path, setPath] = useState<BreadcrumbEntry[]>(initialPath);
  const currentFolderId = path[path.length - 1].id;

  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [folderCounts, setFolderCounts] = useState<Map<string, { files: number; folders: number }>>(new Map());

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DocItem[] | null>(null);

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

  useEffect(() => {
    if (folders.length === 0) { setFolderCounts(new Map()); return; }
    const token = getToken();
    if (!token) return;
    Promise.all(
      folders.map(async folder => {
        const [fRes, dRes] = await Promise.all([
          fetch(`/api/folders?projectId=${projectId}&type=docs&parentId=${folder.id}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/docs?projectId=${projectId}&folderId=${folder.id}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const fJson = await fRes.json() as { ok: boolean; data?: FolderItem[] };
        const dJson = await dRes.json() as { ok: boolean; data?: DocItem[] };
        return { id: folder.id, files: dJson.data?.length ?? 0, folders: fJson.data?.length ?? 0 };
      })
    ).then(results => setFolderCounts(new Map(results.map(r => [r.id, { files: r.files, folders: r.folders }]))));
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
    const token = getToken();
    if (!token) return;

    const folderParam = currentFolderId ? `&parentId=${currentFolderId}` : "";
    const folderIdParam = currentFolderId ? `&folderId=${currentFolderId}` : "&folderId=";

    const [foldersRes, docsRes] = await Promise.all([
      fetch(`/api/folders?projectId=${projectId}&type=docs${folderParam}`, {
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

  const FILE_COLUMNS = [
    { label: "Name", defaultSize: 0, minWidth: 200, maxWidth: 500 },
    { label: "Created by", defaultSize: 0, minWidth: 150, maxWidth: 400 },
    { label: "Last updated", defaultSize: 25, minSize: 12 },
  ];

  function renderTable(folderRows: FolderItem[], docRows: DocItem[]) {
    return (
      <ResizableTable columns={FILE_COLUMNS} storageKey="file-columns">
        <>
          {folderRows.map(folder => {
            const isDropTarget = dropTarget === folder.id;
            return (
              <ResizableTableRow
                key={folder.id}
                columns={FILE_COLUMNS}
                draggable
                  onDragStart={() => onDragStart("folder", folder.id)}
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
                    else await moveFolder(item.id, folder.id);
                  }}
                  className={`cursor-pointer ${isDropTarget ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : ""}`}
                  cells={[
                    {
                      content: (
                        <>
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
                        </>
                      ),
                      onClick: () => enterFolder(folder),
                    },
                    { content: null },
                    { content: null },
                  ]}
                />
              );
            })}
          {docRows.map(doc => {
            const navToDoc = () => navigate(`/projects/${projectId}/docs/${doc.id}`, { state: { folderPath: path } });
            return (
              <ResizableTableRow
                key={doc.id}
                columns={FILE_COLUMNS}
                draggable
                  onDragStart={() => onDragStart("doc", doc.id)}
                  onDragEnd={onDragEnd}
                  checkboxCell={
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
                  }
                  cells={[
                    {
                      content: (
                        <>
                          <FileText className="h-4 w-4 shrink-0 mr-2 text-muted-foreground/60" />
                          <span className="text-sm truncate">{doc.title || "Untitled"}</span>
                        </>
                      ),
                      className: "px-3 cursor-pointer",
                      onClick: navToDoc,
                    },
                    {
                      content: (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                          {doc.author_name ?? ""}
                          {doc.author_role && <RoleBadge role={doc.author_role} />}
                        </div>
                      ),
                      onClick: navToDoc,
                    },
                    {
                      content: <span className="text-sm text-muted-foreground truncate">{formatRelativeTime(doc.updated_at)}</span>,
                      onClick: navToDoc,
                    },
                  ]}
                />
              );
          })}
        </>
      </ResizableTable>
    );
  }

  return (
    <div className="flex flex-col">

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
        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No files found</p>
            </div>
          ) : renderTable([], searchResults)
        ) : folders.length === 0 && docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Folder className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">This folder is empty</p>
          </div>
        ) : renderTable(folders, docs)}
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
