import { Toaster as Sonner } from "sonner";

type SonnerProps = React.ComponentProps<typeof Sonner>;

// Mirrors the main app's Toaster (packages/frontend) so admin toasts share
// the same surface/typography. The admin shell is hardcoded dark, so the
// theme is pinned to "dark" rather than following the system preference.
export function Toaster(props: SonnerProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
