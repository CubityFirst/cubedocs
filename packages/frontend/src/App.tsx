import { Routes, Route } from "react-router-dom";
import { DocsLayout } from "./layouts/DocsLayout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectPage } from "./pages/ProjectPage";
import { DocPage } from "./pages/DocPage";
import { FilePage } from "./pages/FilePage";
import { PasswordVaultPage } from "./pages/PasswordVaultPage";
import { SystemsPage } from "./pages/SystemsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SiteSettingsPage } from "./pages/SiteSettingsPage";
import { UserSettingsPage } from "./pages/UserSettingsPage";
import { PublicDocPage } from "./pages/PublicDocPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<DocsLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
        <Route path="/projects/:projectId/docs/:docId" element={<DocPage />} />
        <Route path="/projects/:projectId/files/:fileId" element={<FilePage />} />
        <Route path="/projects/:projectId/passwords" element={<PasswordVaultPage />} />
        <Route path="/projects/:projectId/systems" element={<SystemsPage />} />
        <Route path="/projects/:projectId/settings" element={<SiteSettingsPage />} />
        <Route path="/settings" element={<UserSettingsPage />} />
      </Route>
      <Route path="/s/:projectId" element={<PublicDocPage />} />
      <Route path="/s/:projectId/:docId" element={<PublicDocPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
