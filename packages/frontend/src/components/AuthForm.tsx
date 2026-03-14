import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuthFormProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  loading?: boolean;
  error?: string | null;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export function AuthForm({
  title,
  subtitle,
  submitLabel,
  loading,
  error,
  onSubmit,
  children,
  footer,
}: AuthFormProps) {
  return (
    <div className="flex min-h-screen">
      <div className="flex w-full max-w-md flex-col items-center justify-center px-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {children}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? `${submitLabel}…` : submitLabel}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </div>

      <div className="relative hidden flex-1 lg:block" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>
    </div>
  );
}
