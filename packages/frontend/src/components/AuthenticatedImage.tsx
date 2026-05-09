import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { Badge } from "@/components/ui/badge";
import { ImageOff } from "lucide-react";

interface Props extends React.ComponentPropsWithoutRef<"img"> {
  projectId?: string;
  /** Public mode: rewrites /api/files/ to /api/public/files/?projectId= and skips auth. */
  isPublic?: boolean;
}

// Module-level dedup so concurrent renders of the same image src share a single
// network fetch. The browser HTTP cache covers subsequent renders within
// max-age, but the *first* render of a doc with N copies of one image used to
// fire N parallel fetches because the browser doesn't always coalesce
// concurrent fetch() calls. We hold the resolved promise briefly after
// resolution so adjacent component mounts can hit the same in-memory blob.
const inflight = new Map<string, Promise<Blob | null>>();

function getImageBlob(src: string): Promise<Blob | null> {
  const existing = inflight.get(src);
  if (existing) return existing;
  const p = apiFetch(src).then(r => r.ok ? r.blob() : null, () => null);
  inflight.set(src, p);
  // Evict the entry shortly after resolution. 5s comfortably covers a single
  // document's render cycle without pinning large Blobs in memory afterward.
  // The `=== p` guard avoids racing a newer entry that replaced this one.
  p.then(() => setTimeout(() => {
    if (inflight.get(src) === p) inflight.delete(src);
  }, 5_000));
  return p;
}

export function AuthenticatedImage({ src, alt, projectId, isPublic, ...props }: Props) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);

    if (!src?.startsWith("/api/files/") && !src?.startsWith("/api/public/files/")) {
      setResolvedSrc(src ?? null);
      return;
    }

    if (isPublic) {
      let publicSrc = src;
      if (src.startsWith("/api/files/")) {
        publicSrc = src.replace("/api/files/", "/api/public/files/");
      }
      if (projectId && !publicSrc.includes("projectId=")) {
        publicSrc += (publicSrc.includes("?") ? "&" : "?") + `projectId=${projectId}`;
      }
      setResolvedSrc(publicSrc);
      return;
    }

    let blobUrl: string | null = null;
    let cancelled = false;
    const fetchSrc = projectId ? `${src}?projectId=${projectId}` : src;
    getImageBlob(fetchSrc).then(blob => {
      if (cancelled) return;
      if (blob) {
        blobUrl = URL.createObjectURL(blob);
        setResolvedSrc(blobUrl);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src, projectId, isPublic]);

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
