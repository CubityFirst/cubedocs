import { useParams, useOutletContext } from "react-router-dom";
import { SystemsManager } from "@/components/SystemsManager";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";

export function SystemsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projectName, myRole } = useOutletContext<DocsLayoutContext>();

  if (!projectId) return null;

  return (
    <SystemsManager
      projectId={projectId}
      projectName={projectName || "Systems"}
      myRole={myRole}
    />
  );
}
