import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Makes a controlled sheet dismissable with the browser / phone Back button.
 *
 * When the sheet opens we push a throwaway history entry; a Back navigation
 * pops it, which we treat as a request to close (so Back closes the sheet
 * instead of leaving the page). When the sheet closes by any other means
 * (X button, Escape, overlay tap) we pop our own entry back off, so we never
 * leave a dead entry that would swallow the user's next Back press.
 *
 * We merge the existing `history.state` into the pushed entry so react-router's
 * own bookkeeping survives the round-trip. No-op for uncontrolled sheets
 * (those without an `open` prop) and during SSR.
 */
function useBackButtonClose(open: boolean | undefined, onClose: () => void) {
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open || typeof window === "undefined") return;

    // Did *we* push an entry that still needs cleaning up on close?
    let pushed = true;
    window.history.pushState({ ...window.history.state, __sheet: true }, "");

    const onPop = () => {
      // The browser already popped our entry; just run the close.
      pushed = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed by something other than Back — remove our sentinel entry.
      if (pushed) window.history.back();
    };
  }, [open]);
}

function Sheet({ open, onOpenChange, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  useBackButtonClose(open, () => onOpenChange?.(false));
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l bg-background shadow-xl duration-300 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("shrink-0 px-6 py-5 border-b", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground mt-0.5", className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-5", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("shrink-0 px-6 py-4 border-t", className)} {...props} />;
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter };
