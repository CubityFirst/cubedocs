import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthForm } from "@/components/AuthForm";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json() as { ok: boolean; data?: { token: string }; error?: string };
      if (json.ok && json.data) {
        localStorage.setItem("token", json.data.token);
        window.location.href = "/dashboard";
      } else {
        setError("Invalid email or password.");
      }
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title="CubeDocs"
      subtitle="Sign in to your account"
      submitLabel="Sign in"
      loading={loading}
      error={error}
      onSubmit={handleSubmit}
      footer={
        <>
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-primary underline-offset-4 hover:underline">
            Sign up
          </a>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
      </div>
    </AuthForm>
  );
}
