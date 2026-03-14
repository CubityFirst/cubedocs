import { FileText } from "lucide-react";

export function ProjectPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">Select a document</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a document from the sidebar to start reading.
        </p>
      </div>
    </div>
  );
}
