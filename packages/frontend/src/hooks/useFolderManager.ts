import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useOutletContext } from "react-router-dom";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";
import { getToken } from "@/lib/auth";
import type { DeleteTarget, SingleDeleteTarget } from "@/components/DeleteAssetDialog";

export interface FolderItem {
  id: string;
  name: string;
  project_id: string;
  parent_id: string | null;
  created_at: string;
}

export interface BreadcrumbEntry {
  id: string | null;
  name: string;
}

export interface FolderManagerOptions {
  projectId: string;
  projectName: string;
  /** Passed as `?type=` to the folders API */
  folderType: string;
  /**
   * If true, folder navigation is stored in router history state so browser
   * back/forward restores the folder position. Use this when the manager lives
   * on a page that navigates away (e.g. opening a document).
   */
  routerNav?: boolean;
  /**
   * Called when a non-folder item is dropped on a folder or breadcrumb.
   * The `itemType` is whatever string was passed to `onDragStart`.
   */
  moveItem: (itemId: string, itemType: string, targetFolderId: string | null) => Promise<void>;
  /**
   * Called (debounced 250 ms) when the search query changes.
   * An empty string means the query was cleared — use it to reset search results.
   */
  onSearch: (query: string, currentFolderId: string | null) => void;
  /**
   * Called when folder child counts need loading.
   * Return a map of folderId → { files, folders }.
   */
  loadCounts: (
    folderIds: string[],
    currentFolderId: string | null,
    token: string,
  ) => Promise<Map<string, { files: number; folders: number }>>;
}

export function useFolderManager({
  projectId,
  projectName,
  folderType,
  routerNav = false,
  moveItem,
  onSearch,
  loadCounts,
}: FolderManagerOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setBreadcrumbs } = useOutletContext<DocsLayoutContext>();

  const initialPath: BreadcrumbEntry[] =
    (routerNav ? location.state?.restorePath : null) ?? [{ id: null, name: projectName }];
  const [path, setPath] = useState<BreadcrumbEntry[]>(initialPath);
  const currentFolderId = path[path.length - 1].id;

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [folderCounts, setFolderCounts] = useState<Map<string, { files: number; folders: number }>>(new Map());

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const draggedItem = useRef<{ type: string; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  // Prevents the click event browsers fire after a drop from triggering navigation
  const dropJustFired = useRef(false);
  function suppressNextClick() {
    dropJustFired.current = true;
    setTimeout(() => { dropJustFired.current = false; }, 0);
  }

  // Keep callback refs up-to-date to avoid stale closures in effects
  const moveItemRef = useRef(moveItem);
  const onSearchRef = useRef(onSearch);
  const loadCountsRef = useRef(loadCounts);
  useEffect(() => { moveItemRef.current = moveItem; });
  useEffect(() => { onSearchRef.current = onSearch; });
  useEffect(() => { loadCountsRef.current = loadCounts; });

  // Restore path from router history (back/forward navigation)
  useEffect(() => {
    if (!routerNav) return;
    const restored = location.state?.restorePath;
    setPath(restored ?? [{ id: null, name: projectName }]);
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load folders when the current folder or project changes
  useEffect(() => {
    loadFolders();
  }, [currentFolderId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload folder counts whenever the folder list changes
  useEffect(() => {
    if (folders.length === 0) { setFolderCounts(new Map()); return; }
    const token = getToken();
    if (!token) return;
    loadCountsRef.current(folders.map(f => f.id), currentFolderId, token).then(setFolderCounts);
  }, [folders, currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync breadcrumbs with the layout
  useEffect(() => {
    setBreadcrumbs(path.map((crumb, i) => {
      const crumbKey = crumb.id ?? "root";
      const isLast = i === path.length - 1;
      return {
        id: crumb.id,
        name: crumb.name,
        onClick: isLast ? undefined : () => { if (!dropJustFired.current) navigateToCrumb(i); },
        onDragOver: (e: React.DragEvent) => onCrumbDragOver(e, crumb.id),
        onDragLeave: onCrumbDragLeave,
        onDrop: (e: React.DragEvent) => onCrumbDrop(e, crumb.id),
        isDropTarget: dropTarget === crumbKey,
      };
    }));
    return () => setBreadcrumbs([]);
  }, [path, dropTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      onSearchRef.current("", currentFolderId);
      return;
    }
    const timer = setTimeout(() => {
      onSearchRef.current(searchQuery.trim(), currentFolderId);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, projectId, currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadFolders() {
    const token = getToken();
    if (!token) return;
    const folderParam = currentFolderId ? `&parentId=${currentFolderId}` : "";
    const res = await fetch(
      `/api/folders?projectId=${projectId}&type=${folderType}${folderParam}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json() as { ok: boolean; data?: FolderItem[] };
    if (json.ok && json.data) setFolders(json.data);
  }

  function enterFolder(folder: FolderItem) {
    if (dropJustFired.current) return;
    const newPath = [...path, { id: folder.id, name: folder.name }];
    if (routerNav) {
      navigate(location.pathname, { state: { restorePath: newPath } });
    } else {
      setPath(newPath);
    }
  }

  function navigateToCrumb(index: number) {
    const newPath = path.slice(0, index + 1);
    if (routerNav) {
      navigate(location.pathname, { state: { restorePath: newPath } });
    } else {
      setPath(newPath);
    }
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
        body: JSON.stringify({ name: newFolderName.trim(), projectId, parentId: currentFolderId, type: folderType }),
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

  async function moveFolder(folderId: string, targetParentId: string | null) {
    const token = getToken();
    await fetch(`/api/folders/${folderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentId: targetParentId }),
    });
    await loadFolders();
  }

  function onDragStart(type: string, id: string) {
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
    suppressNextClick();
    const item = draggedItem.current;
    if (!item) return;
    if (item.type === "folder") {
      if (item.id === targetFolderId) return;
      await moveFolder(item.id, targetFolderId);
    } else {
      await moveItemRef.current(item.id, item.type, targetFolderId);
    }
  }

  /**
   * Returns drag/drop props to spread onto a folder row, plus an `isDropTarget`
   * flag for conditional styling.
   */
  function getFolderRowProps(folder: FolderItem) {
    const isDropTarget = dropTarget === folder.id;
    return {
      draggable: true as const,
      onDragStart: () => onDragStart("folder", folder.id),
      onDragEnd,
      onDragOver: (e: React.DragEvent) => {
        if (draggedItem.current?.id === folder.id) return;
        e.preventDefault();
        setDropTarget(folder.id);
      },
      onDragLeave: () => setDropTarget(null),
      onDrop: async (e: React.DragEvent) => {
        e.preventDefault();
        setDropTarget(null);
        suppressNextClick();
        const item = draggedItem.current;
        if (!item || item.id === folder.id) return;
        if (item.type === "folder") await moveFolder(item.id, folder.id);
        else await moveItemRef.current(item.id, item.type, folder.id);
      },
      isDropTarget,
      className: `cursor-pointer ${isDropTarget ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : ""}` as string,
    };
  }

  function openDeleteSingle(kind: SingleDeleteTarget["kind"], id: string, name: string) {
    setDeleteTarget({ type: "single", kind, id, name });
    setDeleteDialogOpen(true);
  }

  return {
    // State
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
    deleteTarget,
    deleteDialogOpen,
    setDeleteDialogOpen,
    draggedItem,
    dropTarget,
    // Actions
    loadFolders,
    enterFolder,
    navigateToCrumb,
    handleCreateFolder,
    moveFolder,
    onDragStart,
    onDragEnd,
    getFolderRowProps,
    openDeleteSingle,
  };
}
