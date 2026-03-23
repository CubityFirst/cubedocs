import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exchangeAdminHandoff } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { buildDocsAdminLoginUrl, normalizeAdminNextPath } from "@/lib/handoff";

function buildNormalizedCallbackUrl(location: Location): string {
  const url = new URL(location.href);
  url.searchParams.delete("code");
  return url.toString();
}

interface AuthCallbackPageProps {
  onAuthenticated: () => Promise<void> | void;
}

export function AuthCallbackPage({ onAuthenticated }: AuthCallbackPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const nextPath = normalizeAdminNextPath(params.get("next"));

  useEffect(() => {
    if (!code) {
      setError("The admin sign-in handoff was missing a code. Please try again.");
      return;
    }

    const handoffCode = code;
    const callbackUrl = buildNormalizedCallbackUrl(window.location);
    let cancelled = false;

    async function exchange() {
      try {
        const { token } = await exchangeAdminHandoff(handoffCode, callbackUrl);
        setToken(token);
        await onAuthenticated();

        if (!cancelled) {
          navigate(nextPath, { replace: true });
        }
      } catch {
        if (!cancelled) {
          setError("The admin sign-in handoff expired or failed. Please try again.");
        }
      }
    }

    void exchange();

    return () => {
      cancelled = true;
    };
  }, [code, navigate, nextPath, onAuthenticated]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-2 text-center">
          <Shield className="h-8 w-8 text-primary" />
          <CardTitle className="text-2xl">CubeDocs Admin</CardTitle>
          <p className="text-sm text-muted-foreground">
            {error ? "Admin sign-in needs attention" : "Finishing your sign-in..."}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <>
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
              <Button asChild>
                <a href={buildDocsAdminLoginUrl(nextPath)}>Return to CubeDocs sign-in</a>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              We&apos;re exchanging your CubeDocs session for an admin session now.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
