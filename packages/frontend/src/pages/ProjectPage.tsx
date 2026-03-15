import { useParams, useOutletContext } from "react-router-dom";
import { FileManager } from "@/components/FileManager";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projectName, addDoc } = useOutletContext<DocsLayoutContext>();

  if (!projectId) return null;

  return (
    <FileManager
      projectId={projectId}
      projectName={projectName || "Files"}
      onDocCreated={doc => addDoc({ id: doc.id, title: doc.title })}
    />
  );
}
