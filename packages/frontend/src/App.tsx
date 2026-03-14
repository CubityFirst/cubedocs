import { Routes, Route } from "react-router-dom";
import { DocsLayout } from "./layouts/DocsLayout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocPage } from "./pages/DocPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<DocsLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/docs/:docId" element={<DocPage />} />
      </Route>
    </Routes>
  );
}
