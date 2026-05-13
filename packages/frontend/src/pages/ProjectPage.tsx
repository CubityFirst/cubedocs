import { useParams, useOutletContext } from "react-router-dom";
import { FileManager } from "@/components/FileManager";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";

export function ProjectPage() {
  const { projectId, folderId } = useParams<{ projectId: string; folderId?: string }>();
  const { projectName, addDoc, myRole, aiEnabled } = useOutletContext<DocsLayoutContext>();

  if (!projectId) return null;

  return (
    <FileManager
      projectId={projectId}
      projectName={projectName || "Files"}
      folderId={folderId ?? null}
      myRole={myRole}
      aiEnabled={aiEnabled}
      onDocCreated={doc => addDoc({ id: doc.id, title: doc.title })}
    />
  );
}
