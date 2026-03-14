import { Routes, Route } from "react-router-dom";
import { DocsLayout } from "./layouts/DocsLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocPage } from "./pages/DocPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<DocsLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/docs/:docId" element={<DocPage />} />
      </Route>
    </Routes>
  );
}
