import { useState, useEffect } from "react";
import { useParams, useOutletContext, useLocation, useNavigate } from "react-router-dom";
import { Image, FileCode, FileArchive, FileText, File, Download, Link, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AuthenticatedImage } from "@/components/AuthenticatedImage";
import { getToken } from "@/lib/auth";
import type { DocsLayoutContext, BreadcrumbItem } from "@/layouts/DocsLayout";

interface FileRecord {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  project_id: string;
  folder_id: string | null;
  uploaded_by: string;
  created_at: string;
}

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <Image className={className} />;
  if (mimeType === "application/json" || mimeType.startsWith("text/")) return <FileCode className={className} />;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip") || mimeType.includes("archive")) return <FileArchive className={className} />;
  if (mimeType === "application/pdf") return <FileText className={className} />;
  return <File className={className} />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function FilePage() {
  const { projectId, fileId } = useParams<{ projectId: string; fileId: string }>();
  const { setBreadcrumbs } = useOutletContext<DocsLayoutContext>();
  const location = useLocation();
  const navigate = useNavigate();
  const [file, setFile] = useState<FileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!fileId) return;
    const token = getToken();
    fetch(`/api/files/${fileId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((json: { ok: boolean; data?: FileRecord }) => {
        if (json.ok && json.data) {
          setFile(json.data);
          const rawPath: { id: string | null; name: string }[] = location.state?.folderPath ?? [];
          const folderCrumbs: BreadcrumbItem[] = rawPath.map((crumb, i) => ({
            id: crumb.id,
            name: crumb.name,
            onClick: () => navigate(`/projects/${projectId}`, { state: { restorePath: rawPath.slice(0, i + 1) } }),
          }));
          setBreadcrumbs([...folderCrumbs, { id: fileId ?? null, name: json.data.name }]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDownload() {
    if (!file) return;
    setDownloading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/files/${file.id}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-destructive">File not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
          <FileTypeIcon mimeType={file.mime_type} className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{file.name}</h1>
          <p className="text-sm text-muted-foreground">{file.mime_type}</p>
        </div>
      </div>

      <Separator className="my-6" />

      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Size</dt>
        <dd>{formatBytes(file.size)}</dd>
        <dt className="text-muted-foreground">Uploaded</dt>
        <dd>{formatDate(file.created_at)}</dd>
      </dl>

      {file.mime_type.startsWith("image/") && (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-muted/30">
          <AuthenticatedImage
            src={`/api/files/${file.id}/content`}
            alt={file.name}
            className="max-h-[60vh] w-full object-contain"
          />
        </div>
      )}

      <div className="mt-8 flex items-center gap-2">
        <Button onClick={handleDownload} disabled={downloading} className="gap-2">
          <Download className="h-4 w-4" />
          {downloading ? "Downloading…" : "Download"}
        </Button>
        {file.mime_type.startsWith("image/") && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              navigator.clipboard.writeText(`![${file.name}](/api/files/${file.id}/content)`);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
          >
            {copiedLink ? <Check className="h-4 w-4 text-green-500" /> : <Link className="h-4 w-4" />}
            {copiedLink ? "Copied!" : "Copy markdown"}
          </Button>
        )}
      </div>
    </div>
  );
}
