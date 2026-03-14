import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthForm } from "@/components/AuthForm";

export function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const json = await res.json() as { ok: boolean; data?: { token: string }; error?: string };
      if (json.ok && json.data) {
        localStorage.setItem("token", json.data.token);
        window.location.href = "/dashboard";
      } else {
        setError(res.status === 409 ? "An account with that email already exists." : "Registration failed. Please try again.");
      }
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title="Create an account"
      subtitle="Get started with CubeDocs"
      submitLabel="Create account"
      loading={loading}
      error={error}
      onSubmit={handleSubmit}
      footer={
        <>
          Already have an account?{" "}
          <a href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </a>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
      </div>
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
