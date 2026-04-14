import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarIcon,
  ChevronDown,
  Download,
  ExternalLink,
  File,
  Folder,
  FolderPlus,
  PlusCircle,
  Pencil,
  Plus,
  Search,
  Server,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ResizableTable, ResizableTableRow } from "@/components/ui/resizable-table";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useFolderManager, type FolderItem } from "@/hooks/useFolderManager";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type SystemCategory = "app" | "service" | "server" | "vendor" | "environment" | "domain" | "database" | "internal_tool";
type SystemStatus = "active" | "planned" | "maintenance" | "deprecated";
type SystemEnvironment = "" | "production" | "staging" | "development" | "test" | "other";

interface SystemItem {
  id: string;
  name: string;
  category: SystemCategory;
  category_label: string | null;
  status: SystemStatus;
  environment: Exclude<SystemEnvironment, ""> | null;
  owner: string | null;
  primary_url: string | null;
  notes: string | null;
  renewal_date: string | null;
  project_id: string;
  folder_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  linked_doc_count?: number;
  attached_file_count?: number;
}

interface SystemDetail extends SystemItem {
  linked_doc_ids: string[];
  linked_file_ids: string[];
}

interface FileItem {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  type: "docs" | "systems";
  project_id: string;
  folder_id: string | null;
  system_id: string | null;
  uploaded_by: string;
  created_at: string;
}

interface DocOption {
  id: string;
  title: string;
}

interface SystemForm {
  name: string;
  category: string;
  status: SystemStatus;
  environment: SystemEnvironment;
  owner: string;
  primaryUrl: string;
  notes: string;
  renewalDate: string;
  linkedDocIds: string[];
  linkedFileIds: string[];
}

type DialogMode = null | "new" | "view" | "edit";
type RenameTarget = { type: "folder" | "system" | "file"; id: string; currentName: string } | null;
type DeleteTarget = { type: "folder" | "system" | "file"; id: string; name: string } | null;

const BLANK_FORM: SystemForm = {
  name: "",
  category: "Service",
  status: "active",
  environment: "",
  owner: "",
  primaryUrl: "",
  notes: "",
  renewalDate: "",
  linkedDocIds: [],
  linkedFileIds: [],
};

const CATEGORY_OPTIONS: { value: SystemCategory; label: string }[] = [
  { value: "app", label: "App" },
  { value: "service", label: "Service" },
  { value: "server", label: "Server" },
  { value: "vendor", label: "Vendor" },
  { value: "environment", label: "Environment" },
  { value: "domain", label: "Domain" },
  { value: "database", label: "Database" },
  { value: "internal_tool", label: "Internal Tool" },
];

const STATUS_OPTIONS: { value: SystemStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "planned", label: "Planned" },
  { value: "maintenance", label: "Maintenance" },
  { value: "deprecated", label: "Deprecated" },
];

const ENVIRONMENT_OPTIONS: { value: SystemEnvironment; label: string }[] = [
  { value: "", label: "None" },
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
  { value: "test", label: "Test" },
  { value: "other", label: "Other" },
];

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCategory(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function formatStatus(value: string) {
  return value.replace(/\b\w/g, char => char.toUpperCase());
}

function formatEnvironment(value: string | null) {
  if (!value) return "None";
  return value.replace(/\b\w/g, char => char.toUpperCase());
}

export function SystemsManager({
  projectId,
  projectName,
  myRole,
}: {
  projectId: string;
  projectName: string;
  myRole?: string | null;
}) {
  const canEdit = myRole === "editor" || myRole === "admin" || myRole === "owner";
  const navigate = useNavigate();
  const { toast } = useToast();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchResults, setSearchResults] = useState<SystemItem[] | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [detailSystem, setDetailSystem] = useState<SystemDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [form, setForm] = useState<SystemForm>(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [externalDragOver, setExternalDragOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);
  const [docOptions, setDocOptions] = useState<DocOption[]>([]);
  const [allSystemFiles, setAllSystemFiles] = useState<FileItem[]>([]);

  const {
    folders,
    setFolders,
    path,
    currentFolderId,
    folderCounts,
    searchQuery,
    setSearchQuery,
    showNewFolder,
    setShowNewFolder,
    newFolderName,
    setNewFolderName,
    creatingFolder,
    handleCreateFolder,
    loadFolders,
    enterFolder,
    onDragStart,
    onDragEnd,
    getFolderRowProps,
  } = useFolderManager({
    projectId,
    projectName,
    folderType: "systems",
    routerNav: true,
    moveItem: async (itemId, itemType, targetFolderId) => {
      const token = getToken();
      if (!token) return;
      if (itemType === "system") {
        await fetch(`/api/systems/${itemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
      } else if (itemType === "file") {
        await fetch(`/api/files/${itemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
      }
      await Promise.all([loadContents(), loadProjectOptions()]);
    },
    onSearch: async (query, activeFolderId) => {
      if (!query) {
        setSearchResults(null);
        return;
      }
      const token = getToken();
      if (!token) return;
      const rootFolderParam = activeFolderId ? `&rootFolderId=${activeFolderId}` : "";
      const res = await fetch(`/api/systems?projectId=${projectId}&q=${encodeURIComponent(query)}${rootFolderParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { ok: boolean; data?: SystemItem[] };
      if (json.ok && json.data) setSearchResults(json.data);
    },
    loadCounts: async (folderIds, _activeFolderId, token) => {
      const results = await Promise.all(folderIds.map(async folderId => {
        const [subFoldersRes, systemsRes, filesRes] = await Promise.all([
          fetch(`/api/folders?projectId=${projectId}&type=systems&parentId=${folderId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/systems?projectId=${projectId}&folderId=${folderId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/files?projectId=${projectId}&type=systems&folderId=${folderId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const subFoldersJson = await subFoldersRes.json() as { ok: boolean; data?: FolderItem[] };
        const systemsJson = await systemsRes.json() as { ok: boolean; data?: SystemItem[] };
        const filesJson = await filesRes.json() as { ok: boolean; data?: FileItem[] };
        return {
          id: folderId,
          folders: subFoldersJson.data?.length ?? 0,
          files: (systemsJson.data?.length ?? 0) + (filesJson.data?.length ?? 0),
        };
      }));
      return new Map(results.map(result => [result.id, { files: result.files, folders: result.folders }]));
    },
  });

  useEffect(() => {
    loadContents().catch(() => {});
  }, [currentFolderId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadProjectOptions().catch(() => {});
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadContents() {
    const token = getToken();
    if (!token) return;
    const folderIdParam = currentFolderId ? `&folderId=${currentFolderId}` : "&folderId=";
    const [systemsRes, filesRes] = await Promise.all([
      fetch(`/api/systems?projectId=${projectId}${folderIdParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`/api/files?projectId=${projectId}&type=systems${folderIdParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    const systemsJson = await systemsRes.json() as { ok: boolean; data?: SystemItem[] };
    const filesJson = await filesRes.json() as { ok: boolean; data?: FileItem[] };
    if (systemsJson.ok && systemsJson.data) setSystems(systemsJson.data);
    if (filesJson.ok && filesJson.data) setFiles(filesJson.data);
  }

  async function loadProjectOptions() {
    const token = getToken();
    if (!token) return;
    const [docsRes, filesRes] = await Promise.all([
      fetch(`/api/docs?projectId=${projectId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/files?projectId=${projectId}&type=systems`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const docsJson = await docsRes.json() as { ok: boolean; data?: DocOption[] };
    const filesJson = await filesRes.json() as { ok: boolean; data?: FileItem[] };
    if (docsJson.ok && docsJson.data) setDocOptions(docsJson.data);
    if (filesJson.ok && filesJson.data) setAllSystemFiles(filesJson.data);
  }

  async function openSystem(systemId: string) {
    setDialog("view");
    setLoadingDetail(true);
    setDetailSystem(null);
    try {
      const token = getToken();
      const res = await fetch(`/api/systems/${systemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { ok: boolean; data?: SystemDetail };
      if (json.ok && json.data) setDetailSystem(json.data);
    } finally {
      setLoadingDetail(false);
    }
  }

  function openNew() {
    setForm(BLANK_FORM);
    setDetailSystem(null);
    setDialog("new");
  }

  function startEdit() {
    if (!detailSystem) return;
    setForm({
      name: detailSystem.name,
      category: detailSystem.category_label ?? formatCategory(detailSystem.category),
      status: detailSystem.status,
      environment: detailSystem.environment ?? "",
      owner: detailSystem.owner ?? "",
      primaryUrl: detailSystem.primary_url ?? "",
      notes: detailSystem.notes ?? "",
      renewalDate: detailSystem.renewal_date ?? "",
      linkedDocIds: detailSystem.linked_doc_ids,
      linkedFileIds: detailSystem.linked_file_ids,
    });
    setDialog("edit");
  }

  function setField<K extends keyof SystemForm>(key: K, value: SystemForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleLinkedId(
    key: "linkedDocIds" | "linkedFileIds",
    id: string,
    checked: boolean,
  ) {
    setForm(prev => {
      const next = new Set(prev[key]);
      if (checked) next.add(id);
      else next.delete(id);
      return { ...prev, [key]: [...next] };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const token = getToken();
      const payload = {
        name: form.name,
        category: form.category,
        status: form.status,
        environment: form.environment || null,
        owner: form.owner || null,
        primaryUrl: form.primaryUrl || null,
        notes: form.notes || null,
        renewalDate: form.renewalDate || null,
        folderId: currentFolderId,
        linkedDocIds: form.linkedDocIds,
        linkedFileIds: form.linkedFileIds,
      };
      if (dialog === "new") {
        const res = await fetch("/api/systems", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...payload, projectId }),
        });
        const json = await res.json() as { ok: boolean; data?: SystemDetail };
        if (json.ok && json.data) {
          await Promise.all([loadContents(), loadProjectOptions()]);
          setDialog(null);
          toast({ title: "System created." });
        } else {
          toast({ title: "Failed to create system.", variant: "destructive" });
        }
      } else if (dialog === "edit" && detailSystem) {
        const res = await fetch(`/api/systems/${detailSystem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const json = await res.json() as { ok: boolean; data?: SystemDetail };
        if (json.ok && json.data) {
          await Promise.all([loadContents(), loadProjectOptions()]);
          await openSystem(detailSystem.id);
          toast({ title: "System updated." });
        } else {
          toast({ title: "Failed to update system.", variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "Could not connect to the server.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(filesToUpload: FileList | null) {
    if (!filesToUpload?.length) return;
    const token = getToken();
    if (!token) return;
    setUploading(true);
    try {
      await Promise.all(Array.from(filesToUpload).map(async file => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", projectId);
        formData.append("type", "systems");
        if (currentFolderId) formData.append("folderId", currentFolderId);
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) throw new Error("upload-failed");
      }));
      await Promise.all([loadContents(), loadProjectOptions()]);
      toast({ title: filesToUpload.length === 1 ? "File uploaded." : "Files uploaded." });
    } catch {
      toast({ title: "Failed to upload file.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  async function uploadDroppedFiles(filesToUpload: File[]) {
    if (filesToUpload.length === 0) return;
    const token = getToken();
    if (!token) return;
    setUploadingCount(filesToUpload.length);
    try {
      await Promise.all(filesToUpload.map(async file => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", projectId);
        formData.append("type", "systems");
        if (currentFolderId) formData.append("folderId", currentFolderId);
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) throw new Error("upload-failed");
      }));
      await Promise.all([loadContents(), loadProjectOptions()]);
      toast({ title: filesToUpload.length === 1 ? "File uploaded." : "Files uploaded." });
    } catch {
      toast({ title: "Failed to upload file.", variant: "destructive" });
    } finally {
      setUploadingCount(0);
      setExternalDragOver(false);
    }
  }

  async function downloadFile(file: FileItem) {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`/api/files/${file.id}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExternalDrop(e: React.DragEvent) {
    e.preventDefault();
    setExternalDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (!canEdit || droppedFiles.length === 0) return;
    uploadDroppedFiles(droppedFiles).catch(() => {});
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
        setFolders(prev => prev.map(folder => folder.id === renameTarget.id ? { ...folder, name: renameName.trim() } : folder));
      } else if (renameTarget.type === "system") {
        await fetch(`/api/systems/${renameTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: renameName.trim() }),
        });
        setSystems(prev => prev.map(system => system.id === renameTarget.id ? { ...system, name: renameName.trim() } : system));
        if (detailSystem?.id === renameTarget.id) {
          setDetailSystem(prev => prev ? { ...prev, name: renameName.trim() } : prev);
        }
      } else {
        await fetch(`/api/files/${renameTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: renameName.trim() }),
        });
        setFiles(prev => prev.map(file => file.id === renameTarget.id ? { ...file, name: renameName.trim() } : file));
        setAllSystemFiles(prev => prev.map(file => file.id === renameTarget.id ? { ...file, name: renameName.trim() } : file));
      }
      setRenameTarget(null);
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const token = getToken();
    try {
      const endpoint = deleteTarget.type === "folder"
        ? `/api/folders/${deleteTarget.id}`
        : deleteTarget.type === "system"
        ? `/api/systems/${deleteTarget.id}`
        : `/api/files/${deleteTarget.id}`;
      const res = await fetch(endpoint, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        if (deleteTarget.type === "folder") setFolders(prev => prev.filter(folder => folder.id !== deleteTarget.id));
        if (deleteTarget.type === "system") {
          setSystems(prev => prev.filter(system => system.id !== deleteTarget.id));
          if (detailSystem?.id === deleteTarget.id) setDialog(null);
        }
        if (deleteTarget.type === "file") {
          setFiles(prev => prev.filter(file => file.id !== deleteTarget.id));
          setAllSystemFiles(prev => prev.filter(file => file.id !== deleteTarget.id));
        }
        await Promise.all([loadFolders(), loadProjectOptions()]);
        setDeleteTarget(null);
      } else {
        toast({ title: "Failed to delete item.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not connect to the server.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  function openLinkedDoc(docId: string) {
    navigate(`/projects/${projectId}/docs/${docId}`);
  }

  function openLinkedFile(fileId: string) {
    navigate(`/projects/${projectId}/files/${fileId}`, {
      state: {
        folderPath: path,
        restorePath: path,
        basePath: `/projects/${projectId}/systems`,
      },
    });
  }

  const docLabelById = new Map(docOptions.map(doc => [doc.id, doc.title || "Untitled"]));
  const fileLabelById = new Map(allSystemFiles.map(file => [file.id, file.name]));

  const SYSTEM_COLUMNS = [
    { label: "Name", defaultSize: 0, minWidth: 220, maxWidth: 440 },
    { label: "Category", defaultSize: 0, minWidth: 130, maxWidth: 200 },
    { label: "Owner", defaultSize: 0, minWidth: 130, maxWidth: 240 },
    { label: "Status", defaultSize: 0, minWidth: 140, maxWidth: 220 },
    { label: "Updated", defaultSize: 16, minSize: 10 },
  ];

  function renderTable(folderRows: FolderItem[], systemRows: SystemItem[], fileRows: FileItem[]) {
    return (
      <ResizableTable columns={SYSTEM_COLUMNS} storageKey="systems-columns" checkboxColumn={false}>
        <>
          {folderRows.map(folder => {
            const folderRowConfig = canEdit ? getFolderRowProps(folder) : { isDropTarget: false };
            const { isDropTarget, ...folderRowProps } = folderRowConfig;
            const folderRow = (
              <ResizableTableRow
                key={folder.id}
                columns={SYSTEM_COLUMNS}
                {...folderRowProps}
                cells={[
                  {
                    content: (
                      <div className="flex min-w-0 items-center">
                        <Folder className={`mr-2 h-4 w-4 shrink-0 ${isDropTarget ? "text-primary" : "text-primary/70"}`} />
                        <span className="truncate text-sm font-medium">{folder.name}</span>
                        {folderCounts.has(folder.id) && (
                          <Badge variant="outline" className="ml-2 shrink-0 text-xs text-muted-foreground">
                            {(() => {
                              const counts = folderCounts.get(folder.id)!;
                              const parts = [];
                              if (counts.files > 0) parts.push(`${counts.files} items`);
                              if (counts.folders > 0) parts.push(`${counts.folders} folders`);
                              return parts.join(", ");
                            })()}
                          </Badge>
                        )}
                      </div>
                    ),
                    onClick: () => enterFolder(folder),
                    className: "px-3",
                  },
                  { content: null },
                  { content: null },
                  { content: null },
                  {
                    content: canEdit ? (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={e => {
                            e.stopPropagation();
                            setRenameTarget({ type: "folder", id: folder.id, currentName: folder.name });
                            setRenameName(folder.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={e => {
                            e.stopPropagation();
                            setDeleteTarget({ type: "folder", id: folder.id, name: folder.name });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null,
                  },
                ]}
              />
            );
            if (!canEdit) return <div key={folder.id}>{folderRow}</div>;
            return (
              <ContextMenu key={folder.id}>
                <ContextMenuTrigger asChild><div>{folderRow}</div></ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => {
                    setRenameTarget({ type: "folder", id: folder.id, currentName: folder.name });
                    setRenameName(folder.name);
                  }}>
                    <Pencil />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onClick={() => setDeleteTarget({ type: "folder", id: folder.id, name: folder.name })}>
                    <Trash2 />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          {systemRows.map(system => {
            const systemRow = (
              <ResizableTableRow
              key={system.id}
              columns={SYSTEM_COLUMNS}
              draggable={canEdit}
              onDragStart={canEdit ? () => onDragStart("system", system.id) : undefined}
              onDragEnd={canEdit ? onDragEnd : undefined}
              cells={[
                {
                  content: (
                    <div className="flex min-w-0 items-center">
                      <Server className="mr-2 h-4 w-4 shrink-0 text-muted-foreground/70" />
                      <span className="truncate text-sm">{system.name}</span>
                    </div>
                  ),
                  className: "cursor-pointer px-3",
                  onClick: () => openSystem(system.id),
                },
                { content: <Badge variant="outline">{formatCategory(system.category_label ?? system.category)}</Badge> },
                { content: <span className="truncate text-sm text-muted-foreground">{system.owner ?? "Unassigned"}</span> },
                {
                  content: (
                    <div className="flex items-center gap-2">
                      <Badge variant={system.status === "active" ? "secondary" : "outline"}>
                        {formatStatus(system.status)}
                      </Badge>
                      {system.environment && (
                        <span className="truncate text-xs text-muted-foreground">{formatEnvironment(system.environment)}</span>
                      )}
                    </div>
                  ),
                },
                {
                  content: (
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm text-muted-foreground">{formatRelativeTime(system.updated_at)}</span>
                      <div className="flex items-center gap-1">
                        {system.primary_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={e => {
                              e.stopPropagation();
                              window.open(system.primary_url ?? "", "_blank", "noopener,noreferrer");
                            }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={e => {
                                e.stopPropagation();
                                setRenameTarget({ type: "system", id: system.id, currentName: system.name });
                                setRenameName(system.name);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={e => {
                                e.stopPropagation();
                                setDeleteTarget({ type: "system", id: system.id, name: system.name });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ),
                },
              ]}
            />
            );
            return (
              <ContextMenu key={system.id}>
                <ContextMenuTrigger asChild><div>{systemRow}</div></ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => openSystem(system.id)}>
                    <Server />
                    Open
                  </ContextMenuItem>
                  {system.primary_url && (
                    <>
                      <ContextMenuItem onClick={() => window.open(system.primary_url ?? "", "_blank", "noopener,noreferrer")}>
                        <ExternalLink />
                        Open URL
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => {
                        navigator.clipboard.writeText(system.primary_url ?? "");
                        toast({ title: "URL copied" });
                      }}>
                        <ExternalLink />
                        Copy URL
                      </ContextMenuItem>
                    </>
                  )}
                  {canEdit && <ContextMenuSeparator />}
                  {canEdit && (
                    <ContextMenuItem onClick={() => {
                      setRenameTarget({ type: "system", id: system.id, currentName: system.name });
                      setRenameName(system.name);
                    }}>
                      <Pencil />
                      Rename
                    </ContextMenuItem>
                  )}
                  {canEdit && (
                    <ContextMenuItem variant="destructive" onClick={() => setDeleteTarget({ type: "system", id: system.id, name: system.name })}>
                      <Trash2 />
                      Delete
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          {fileRows.map(file => {
            const fileRow = (
              <ResizableTableRow
              key={file.id}
              columns={SYSTEM_COLUMNS}
              draggable={canEdit}
              onDragStart={canEdit ? () => onDragStart("file", file.id) : undefined}
              onDragEnd={canEdit ? onDragEnd : undefined}
              cells={[
                {
                  content: (
                    <div className="flex min-w-0 items-center">
                      <File className="mr-2 h-4 w-4 shrink-0 text-muted-foreground/60" />
                      <span className="truncate text-sm">{file.name}</span>
                    </div>
                  ),
                  className: "cursor-pointer px-3",
                  onClick: () => openLinkedFile(file.id),
                },
                { content: <Badge variant="outline">File</Badge> },
                { content: <span className="truncate text-sm text-muted-foreground">Attachment</span> },
                { content: <span className="truncate text-sm text-muted-foreground">{formatBytes(file.size)}</span> },
                {
                  content: (
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm text-muted-foreground">{formatRelativeTime(file.created_at)}</span>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={e => {
                              e.stopPropagation();
                              setRenameTarget({ type: "file", id: file.id, currentName: file.name });
                              setRenameName(file.name);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={e => {
                              e.stopPropagation();
                              setDeleteTarget({ type: "file", id: file.id, name: file.name });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
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
                  <ContextMenuItem onClick={() => openLinkedFile(file.id)}>
                    <File />
                    Open
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/projects/${projectId}/files/${file.id}`);
                    toast({ title: "Link copied" });
                  }}>
                    <ExternalLink />
                    Copy link
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => downloadFile(file)}>
                    <Download />
                    Download
                  </ContextMenuItem>
                  {canEdit && <ContextMenuSeparator />}
                  {canEdit && (
                    <ContextMenuItem onClick={() => {
                      setRenameTarget({ type: "file", id: file.id, currentName: file.name });
                      setRenameName(file.name);
                    }}>
                      <Pencil />
                      Rename
                    </ContextMenuItem>
                  )}
                  {canEdit && (
                    <ContextMenuItem variant="destructive" onClick={() => setDeleteTarget({ type: "file", id: file.id, name: file.name })}>
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
      onDragEnter={e => { if (canEdit && e.dataTransfer.types.includes("Files")) setExternalDragOver(true); }}
      onDragOver={e => {
        if (canEdit && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setExternalDragOver(true);
        }
      }}
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
      <div className="flex items-center gap-2 px-6 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search systems…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {canEdit && (
          <>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => handleUpload(e.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowNewFolder(true)}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New folder
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Upload file"}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />
              New system
            </Button>
          </>
        )}
      </div>

      <div className="px-6 pb-6">
        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No systems found</p>
            </div>
          ) : renderTable([], searchResults, [])
        ) : folders.length === 0 && systems.length === 0 && files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Server className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No systems or files in this folder</p>
          </div>
        ) : renderTable(folders, systems, files)}
      </div>

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

      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-2xl">
          {dialog === "view" && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4 pr-8">
                  <div>
                    <DialogTitle>{detailSystem?.name ?? "System"}</DialogTitle>
                    {detailSystem?.primary_url && (
                      <a
                        href={detailSystem.primary_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {detailSystem.primary_url}
                      </a>
                    )}
                  </div>
                  {canEdit && detailSystem && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={startEdit}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </DialogHeader>

              {loadingDetail ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : detailSystem ? (
                <div className="flex flex-col gap-4 pt-1">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</span>
                      <span className="text-sm">{formatCategory(detailSystem.category_label ?? detailSystem.category)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
                      <span className="text-sm">{formatStatus(detailSystem.status)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Environment</span>
                      <span className="text-sm">{formatEnvironment(detailSystem.environment)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owner</span>
                      <span className="text-sm">{detailSystem.owner ?? "Unassigned"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Renewal date</span>
                      <span className="text-sm">{detailSystem.renewal_date || "None"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last updated</span>
                      <span className="text-sm">{formatRelativeTime(detailSystem.updated_at)}</span>
                    </div>
                  </div>

                  {detailSystem.notes && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</span>
                      <p className="whitespace-pre-wrap text-sm">{detailSystem.notes}</p>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked docs</span>
                      {detailSystem.linked_doc_ids.length === 0 ? (
                        <span className="text-sm text-muted-foreground">None</span>
                      ) : (
                        detailSystem.linked_doc_ids.map(docId => (
                          <Button key={docId} variant="outline" size="sm" className="justify-start" onClick={() => openLinkedDoc(docId)}>
                            {docLabelById.get(docId) ?? "Document"}
                          </Button>
                        ))
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attached files</span>
                      {detailSystem.linked_file_ids.length === 0 ? (
                        <span className="text-sm text-muted-foreground">None</span>
                      ) : (
                        detailSystem.linked_file_ids.map(fileId => (
                          <Button key={fileId} variant="outline" size="sm" className="justify-start" onClick={() => openLinkedFile(fileId)}>
                            {fileLabelById.get(fileId) ?? "File"}
                          </Button>
                        ))
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <DialogFooter>
                      <Button
                        variant="ghost"
                        className="mr-auto text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ type: "system", id: detailSystem.id, name: detailSystem.name })}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </DialogFooter>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-destructive">Failed to load system.</div>
              )}
            </>
          )}
          {(dialog === "new" || dialog === "edit") && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog === "new" ? "New system" : `Edit: ${detailSystem?.name ?? ""}`}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="pt-1">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_260px]">
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="system-name">Name</Label>
                        <Input
                          id="system-name"
                          value={form.name}
                          onChange={e => setField("name", e.target.value)}
                          required
                          autoFocus
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="system-owner">Owner</Label>
                        <Input
                          id="system-owner"
                          value={form.owner}
                          onChange={e => setField("owner", e.target.value)}
                          placeholder="Platform team"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Category</Label>
                        <div className="flex gap-2">
                          <Input
                            value={form.category}
                            onChange={e => setField("category", e.target.value)}
                            placeholder="Service"
                            required
                            className="flex-1"
                          />
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline" size="icon" aria-label="Show category options">
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-2" align="end">
                              <div className="flex flex-col gap-1">
                                {CATEGORY_OPTIONS.map(option => (
                                  <Button
                                    key={option.value}
                                    type="button"
                                    variant="ghost"
                                    className="justify-start"
                                    onClick={() => setField("category", option.label)}
                                  >
                                    {option.label}
                                  </Button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Status</Label>
                        <Select value={form.status} onValueChange={value => setField("status", value as SystemStatus)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(option => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Environment</Label>
                        <Select value={form.environment || "__none__"} onValueChange={value => setField("environment", value === "__none__" ? "" : value as SystemEnvironment)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ENVIRONMENT_OPTIONS.map(option => (
                              <SelectItem key={option.value || "__none__"} value={option.value || "__none__"}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label htmlFor="system-renewal">Renewal date</Label>
                        <div className="flex min-w-0 gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                id="system-renewal"
                                type="button"
                                variant="outline"
                                className={cn(
                                  "min-w-0 flex-1 justify-start text-left font-normal",
                                  !form.renewalDate && "text-muted-foreground",
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                <span className="truncate">
                                  {form.renewalDate
                                    ? format(new Date(`${form.renewalDate}T00:00:00`), "PPP")
                                    : "Pick a date"}
                                </span>
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={form.renewalDate ? new Date(`${form.renewalDate}T00:00:00`) : undefined}
                                onSelect={date => setField("renewalDate", date ? format(date, "yyyy-MM-dd") : "")}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          {form.renewalDate && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() => setField("renewalDate", "")}
                              aria-label="Clear renewal date"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="system-url">Primary URL</Label>
                      <Input
                        id="system-url"
                        type="url"
                        value={form.primaryUrl}
                        onChange={e => setField("primaryUrl", e.target.value)}
                        placeholder="https://example.com"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="system-notes">Notes</Label>
                      <Textarea
                        id="system-notes"
                        value={form.notes}
                        onChange={e => setField("notes", e.target.value)}
                        rows={8}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <LinkSelector
                      title="Documents"
                      items={docOptions.map(doc => ({ id: doc.id, label: doc.title || "Untitled" }))}
                      selectedIds={new Set(form.linkedDocIds)}
                      onToggle={(id, checked) => toggleLinkedId("linkedDocIds", id, checked)}
                    />
                    <LinkSelector
                      title="Files"
                      items={allSystemFiles.map(file => ({ id: file.id, label: file.name }))}
                      selectedIds={new Set(form.linkedFileIds)}
                      onToggle={(id, checked) => toggleLinkedId("linkedFileIds", id, checked)}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setDialog(dialog === "edit" ? "view" : null)}>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is irreversible and all data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LinkSelector({
  title,
  items,
  selectedIds,
  onToggle,
}: {
  title: string;
  items: { id: string; label: string }[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const visibleItems = normalizedQuery
      ? items.filter(item => item.label.toLowerCase().includes(normalizedQuery))
      : items.filter(item => selectedIds.has(item.id));

    return [...visibleItems].sort((a, b) => {
      const aSelected = selectedIds.has(a.id) ? 1 : 0;
      const bSelected = selectedIds.has(b.id) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return a.label.localeCompare(b.label);
    });
  }, [items, query, selectedIds]);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant="outline">{selectedIds.size}</Badge>
      </div>
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {items
            .filter(item => selectedIds.has(item.id))
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(item => (
              <Badge key={item.id} variant="secondary" className="flex items-center gap-1 pr-1">
                <span className="max-w-[180px] truncate">{item.label}</span>
                <button
                  type="button"
                  onClick={() => onToggle(item.id, false)}
                  className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Remove ${item.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}…`}
          className="h-8 pl-8 pr-8 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <ScrollArea className="h-40">
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items</p>
          ) : !query.trim() && filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Search to find records to associate.</p>
          ) : filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches</p>
          ) : (
            filteredItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id, !selectedIds.has(item.id))}
                className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <span className="line-clamp-2 flex-1">{item.label}</span>
                {selectedIds.has(item.id) ? (
                  <Badge variant="secondary">Added</Badge>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <PlusCircle className="h-3.5 w-3.5" />
                    Add
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
