import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { ImageOff } from "lucide-react";

export function AuthenticatedImage({ src, alt, projectId, ...props }: React.ComponentPropsWithoutRef<"img"> & { projectId?: string }) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!src?.startsWith("/api/files/")) {
      setResolvedSrc(src ?? null);
      return;
    }
    let blobUrl: string | null = null;
    let cancelled = false;
    const fetchSrc = projectId ? `${src}?projectId=${projectId}` : src;
    fetch(fetchSrc, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (cancelled) return;
        if (blob) {
          blobUrl = URL.createObjectURL(blob);
          setResolvedSrc(blobUrl);
        } else {
          setFailed(true);
        }
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src, projectId]);

  if (failed) {
    return (
      <a href="https://docs.cubityfir.st/s/e6d11927-cc6b-48d1-8577-af8b08019d61/258a2eb4-edac-4c86-91aa-afdc46c29c00" target="_blank" rel="noopener noreferrer" aria-label="Image unavailable - learn more">
        <Badge variant="destructive" className="inline-flex items-center gap-1.5 font-normal cursor-pointer" title={alt}>
          <ImageOff className="h-3.5 w-3.5 shrink-0" />
          Image unavailable: Learn more about missing images and permissions.
        </Badge>
      </a>
    );
  }

  if (!resolvedSrc) return null;
  return <img src={resolvedSrc} alt={alt} onError={() => setFailed(true)} {...props} />;
}
