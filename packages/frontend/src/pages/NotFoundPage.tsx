export function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-6xl font-bold tracking-tight">404</h1>
      <p className="text-lg text-muted-foreground">Page not found</p>
      <a href="/" className="text-primary underline-offset-4 hover:underline text-sm">
        Go home
      </a>
    </div>
  );
}
