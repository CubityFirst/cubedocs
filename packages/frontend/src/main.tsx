import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";

document.documentElement.classList.add("dark");
if (import.meta.env.DEV) {
  document.documentElement.setAttribute("data-dev", "true");
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
