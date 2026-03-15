import { useParams, useOutletContext } from "react-router-dom";
import { PasswordVaultManager } from "@/components/PasswordVaultManager";
import type { DocsLayoutContext } from "@/layouts/DocsLayout";

export function PasswordVaultPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projectName } = useOutletContext<DocsLayoutContext>();

  if (!projectId) return null;

  return (
    <PasswordVaultManager
      projectId={projectId}
      projectName={projectName || "Vault"}
    />
  );
}
