import { useState } from "react";
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
import { getToken } from "@/lib/auth";

export type SingleDeleteTarget = {
  type: "single";
  kind: "folder" | "doc" | "file";
  id: string;
  name: string;
};

export type MultiDeleteTarget = {
  type: "multiple";
  docIds?: string[];
  fileIds?: string[];
};

export type DeleteTarget = SingleDeleteTarget | MultiDeleteTarget;

interface DeleteAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DeleteTarget | null;
  onDeleted: (target: DeleteTarget) => void;
}

const ENDPOINT: Record<SingleDeleteTarget["kind"], (id: string) => string> = {
  folder: id => `/api/folders/${id}`,
  doc: id => `/api/docs/${id}`,
  file: id => `/api/files/${id}`,
};

export function DeleteAssetDialog({ open, onOpenChange, target, onDeleted }: DeleteAssetDialogProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    if (!target || deleting) return;
    setDeleting(true);
    const token = getToken();
    try {
      if (target.type === "single") {
        await fetch(ENDPOINT[target.kind](target.id), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      } else {
        await Promise.all([
          ...(target.docIds ?? []).map(id =>
            fetch(ENDPOINT.doc(id), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
          ),
          ...(target.fileIds ?? []).map(id =>
            fetch(ENDPOINT.file(id), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
          ),
        ]);
      }
      onDeleted(target);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  function getCount(t: MultiDeleteTarget) {
    return (t.docIds?.length ?? 0) + (t.fileIds?.length ?? 0);
  }

  function getItemLabel(_t: MultiDeleteTarget) {
    return "items";
  }

  const count = target?.type === "multiple" ? getCount(target) : 1;
  const isMultiple = target?.type === "multiple" && count > 1;
  const itemLabel = target?.type === "multiple" ? getItemLabel(target) : "items";

  const title = isMultiple
    ? `Delete ${count} ${itemLabel}?`
    : target?.type === "single"
    ? `Delete "${target.name}"?`
    : "Delete?";

  const description = isMultiple
    ? `You are confirming the deletion of ${count} ${itemLabel}. This action is irreversible and all data will be lost.`
    : "This action is irreversible and all data will be lost.";

  return (
    <AlertDialog open={open} onOpenChange={open => { if (!open) onOpenChange(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : isMultiple ? `Delete ${count} ${itemLabel}` : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
