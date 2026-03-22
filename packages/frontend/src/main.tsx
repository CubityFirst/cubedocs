import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";

if (import.meta.env.DEV) {
  document.documentElement.setAttribute("data-dev", "true");
}

if (import.meta.env.VITE_BRANCH === "dev") {
  document.title = "CubeDocs (dev)";
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
