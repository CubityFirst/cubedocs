import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn "Attachment" component (radix registry). Reconstructed to the documented
// API - the registry item (/docs/components/radix/attachment) isn't published to
// the CLI yet, so this is a hand-built equivalent in the new-york style. When the
// official `shadcn add attachment` ships, this file can be overwritten by it.
//
// Composition: <Attachment> wraps <AttachmentMedia> (icon/image), <AttachmentContent>
// (<AttachmentTitle> + <AttachmentDescription>), and <AttachmentActions> (one or
// more <AttachmentAction>). <AttachmentGroup> is a horizontally-scrollable row of
// cards. `status` drives the upload affordance (shimmer while busy, destructive
// tint on error).

const attachmentVariants = cva(
  "group/attachment relative flex items-center overflow-hidden rounded-lg border bg-card text-card-foreground transition-colors",
  {
    variants: {
      size: {
        default: "gap-3 p-3",
        sm: "gap-2 p-2",
        xs: "gap-2 p-1.5",
      },
      orientation: {
        horizontal: "flex-row",
        vertical: "flex-col items-stretch text-center",
      },
      status: {
        idle: "",
        uploading: "",
        processing: "",
        error: "border-destructive/50 bg-destructive/5",
        done: "",
      },
    },
    defaultVariants: {
      size: "default",
      orientation: "horizontal",
      status: "idle",
    },
  },
);

export interface AttachmentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof attachmentVariants> {
  asChild?: boolean;
}

const Attachment = React.forwardRef<HTMLDivElement, AttachmentProps>(
  ({ className, size, orientation, status = "idle", asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    const busy = status === "uploading" || status === "processing";
    return (
      <Comp
        ref={ref}
        data-slot="attachment"
        data-status={status}
        className={cn(attachmentVariants({ size, orientation, status, className }))}
        {...props}
      >
        {children}
        {busy && (
          // Shimmer overlay while the upload is in flight. Non-interactive.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-foreground/5 to-transparent"
          />
        )}
      </Comp>
    );
  },
);
Attachment.displayName = "Attachment";

const AttachmentMedia = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-media"
    className={cn(
      "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground [&>img]:size-full [&>img]:object-cover [&>svg]:size-4",
      className,
    )}
    {...props}
  />
));
AttachmentMedia.displayName = "AttachmentMedia";

const AttachmentContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-content"
    className={cn("flex min-w-0 flex-1 flex-col justify-center gap-0.5", className)}
    {...props}
  />
));
AttachmentContent.displayName = "AttachmentContent";

const AttachmentTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-title"
    className={cn("truncate text-sm font-medium leading-tight", className)}
    {...props}
  />
));
AttachmentTitle.displayName = "AttachmentTitle";

const AttachmentDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="attachment-description"
    className={cn("truncate text-xs text-muted-foreground", className)}
    {...props}
  />
));
AttachmentDescription.displayName = "AttachmentDescription";

const AttachmentActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-actions"
    className={cn("ml-auto flex shrink-0 items-center gap-1", className)}
    {...props}
  />
));
AttachmentActions.displayName = "AttachmentActions";

export interface AttachmentActionProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const AttachmentAction = React.forwardRef<HTMLButtonElement, AttachmentActionProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        data-slot="attachment-action"
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-3.5",
          className,
        )}
        {...props}
      />
    );
  },
);
AttachmentAction.displayName = "AttachmentAction";

// Full-card overlay link/trigger (covers the whole card via an absolute layer).
const AttachmentTrigger = React.forwardRef<
  HTMLButtonElement,
  AttachmentActionProps
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      data-slot="attachment-trigger"
      className={cn(
        "absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
});
AttachmentTrigger.displayName = "AttachmentTrigger";

const AttachmentGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-group"
    className={cn("flex gap-2 overflow-x-auto", className)}
    {...props}
  />
));
AttachmentGroup.displayName = "AttachmentGroup";

export {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  AttachmentTrigger,
  AttachmentGroup,
  attachmentVariants,
};
