import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";

// Service worker registration. Skipped in dev so it doesn't fight Vite HMR
// (`vite preview` serves the production build, so DEV is false there and
// this still runs for local prod-ish testing).
if (!import.meta.env.DEV) {
  const updateSW = registerSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Long-lived tabs never reload on their own, so poll for a new
      // deploy roughly once a minute. _headers serves sw.js no-cache, so
      // this update() reliably sees a fresh worker.
      setInterval(() => {
        void registration.update();
      }, 60_000);
    },
    onNeedRefresh() {
      // A surprise reload would lose in-progress WYSIWYG/collab editing
      // state, so prompt instead of auto-reloading. onNeedRefresh can fire
      // more than once for the same waiting worker (our 60s poll + the
      // browser's own update check); the stable id makes sonner reuse the
      // existing toast instead of stacking a duplicate.
      toast("A new version is available", {
        id: "sw-update",
        description: "Reload to get the latest update.",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => {
            void updateSW(true);
          },
        },
      });
    },
  });
}
