import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyFontVarsToRoot, readFontPrefsCookie } from "@/lib/fonts";

// Apply the user's saved font choices before React mounts so PublicDocPage and
// the pre-/api/me boot phase of authenticated pages render in the right font
// instead of flashing the default sans stack. Cookie is written by DocsLayout
// whenever font state changes.
applyFontVarsToRoot(readFontPrefsCookie());

if (import.meta.env.DEV) {
  document.documentElement.setAttribute("data-dev", "true");
}

if (import.meta.env.VITE_BRANCH === "dev") {
  document.title = "Annex (dev)";
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </BrowserRouter>
  </StrictMode>,
);
