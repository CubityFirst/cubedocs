import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_AUTH_INVALIDATED_EVENT, clearToken, getToken } from "@/lib/auth";
import { buildDocsAdminLoginUrl } from "@/lib/handoff";
import { type AdminAuthSession, verifyAdminSession } from "@/lib/api";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { UsersPage } from "./pages/UsersPage";
import { AuditPage } from "./pages/AuditPage";
import { OAuthClientsPage } from "./pages/OAuthClientsPage";

function AdminLayout({
  session,
  onLogout,
}: {
  session: AdminAuthSession;
  onLogout: () => void;
}) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center gap-6 border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4" />
          Annex Admin
        </div>

        <nav className="flex gap-1">
          <Button
            variant={location.pathname === "/" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link to="/">Users</Link>
          </Button>
          <Button
            variant={location.pathname === "/projects" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link to="/projects">Projects</Link>
          </Button>
          <Button
            variant={location.pathname === "/audit" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link to="/audit">Audit</Link>
          </Button>
          <Button
            variant={location.pathname === "/oauth-clients" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link to="/oauth-clients">OAuth</Link>
          </Button>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{session.email}</span>
          <Button size="sm" variant="outline" onClick={onLogout}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<UsersPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/oauth-clients" element={<OAuthClientsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<AdminAuthSession | null>(null);
  const [checking, setChecking] = useState(true);

  const refreshSession = useCallback(async (silent = false) => {
    const token = getToken();

    if (!token) {
      setSession(null);
      setChecking(false);
      return;
    }

    // `silent` re-checks (tab refocus) must not flash the full-screen
    // "Checking..." takeover; the initial mount check still shows it.
    if (!silent) setChecking(true);

    try {
      const next = await verifyAdminSession();
      // Defense-in-depth: the server already rejects expired sessions,
      // but enforce the token's own expiry client-side too so a stale
      // token can never leave the admin shell rendered.
      if (next.expiresAt <= Date.now()) {
        clearToken();
        setSession(null);
      } else {
        setSession(next);
      }
    } catch {
      clearToken();
      setSession(null);
    } finally {
      if (!silent) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // Re-validate when the operator returns to the tab: a session can
  // expire or be revoked while the tab is backgrounded, and we don't
  // want the admin UI to stay usable until the next API call 401s.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible" && getToken()) {
        void refreshSession(true);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshSession]);

  useEffect(() => {
    function handleAdminAuthInvalidated() {
      setSession(null);
      setChecking(false);

      if (location.pathname === "/login" || location.pathname === "/auth/callback") {
        return;
      }

      navigate("/login", {
        replace: true,
        state: { from: `${location.pathname}${location.search}` || "/" },
      });
    }

    window.addEventListener(ADMIN_AUTH_INVALIDATED_EVENT, handleAdminAuthInvalidated);
    return () => {
      window.removeEventListener(ADMIN_AUTH_INVALIDATED_EVENT, handleAdminAuthInvalidated);
    };
  }, [location.pathname, location.search, navigate]);

  function handleLogout() {
    clearToken();
    setSession(null);
    window.location.assign(buildDocsAdminLoginUrl("/", { logout: true }));
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking admin session...
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage onAuthenticated={refreshSession} />} />
        <Route
          path="*"
          element={
            <Navigate
              to="/login"
              replace
              state={{ from: `${location.pathname}${location.search}` || "/" }}
            />
          }
        />
      </Routes>
    );
  }

  if (location.pathname === "/login" || location.pathname === "/auth/callback") {
    return <Navigate to="/" replace />;
  }

  return <AdminLayout session={session} onLogout={handleLogout} />;
}
