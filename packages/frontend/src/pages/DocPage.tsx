import { useParams } from "react-router-dom";

export function DocPage() {
  const { docId } = useParams<{ docId: string }>();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Doc ID: {docId}</p>
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p className="text-muted-foreground">Loading document...</p>
      </div>
    </div>
  );
}
