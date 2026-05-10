import type * as React from "react";
import { toast as sonnerToast } from "sonner";

type Variant = "default" | "destructive";

interface ToastInput {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: Variant;
}

function toast({ title, description, variant }: ToastInput) {
  const fn = variant === "destructive" ? sonnerToast.error : sonnerToast.success;
  const id = fn(title ?? "", { description });
  return { id, dismiss: () => sonnerToast.dismiss(id) };
}

function useToast() {
  return {
    toast,
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
  };
}

export { useToast, toast };
