import type { ReactNode } from "react";

import { Loader2, Save, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface InlineSaveControlsProps {
  changed: boolean;
  saving: boolean;
  onReset: () => void;
  saveDisabled?: boolean;
  resetLabel: string;
  saveLabel: string;
  /** Render the input here. Add `pr-9` to its className to leave room for the inline reset icon. */
  children: ReactNode;
}

export function InlineSaveControls({
  changed,
  saving,
  onReset,
  saveDisabled,
  resetLabel,
  saveLabel,
  children,
}: InlineSaveControlsProps) {
  return (
    <div className="flex items-center flex-1">
      <div className="relative flex-1">
        {children}
        <button
          type="button"
          onClick={onReset}
          disabled={saving || !changed}
          aria-label={resetLabel}
          aria-hidden={!changed}
          tabIndex={changed ? 0 : -1}
          className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-muted-foreground transition-opacity hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded disabled:pointer-events-none ${
            changed ? "opacity-100" : "opacity-0"
          }`}
        >
          <Undo2 className="size-4" />
        </button>
      </div>
      <div
        className={`flex items-center overflow-hidden transition-[width,opacity] duration-200 ease-out ${
          changed ? "w-11 opacity-100" : "w-0 opacity-0"
        }`}
        aria-hidden={!changed}
      >
        <Button
          type="submit"
          size="icon"
          variant="outline"
          className="ml-2 shrink-0"
          disabled={saving || !changed || saveDisabled}
          tabIndex={changed ? 0 : -1}
          aria-label={saveLabel}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
