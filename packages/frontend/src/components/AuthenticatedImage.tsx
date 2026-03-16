import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";

export function AuthenticatedImage({ src, alt, ...props }: React.ComponentPropsWithoutRef<"img">) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!src?.startsWith("/api/files/")) {
      setResolvedSrc(src ?? null);
      return;
    }
    let blobUrl: string | null = null;
    let cancelled = false;
    fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (blob && !cancelled) {
          blobUrl = URL.createObjectURL(blob);
          setResolvedSrc(blobUrl);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src]);

  if (!resolvedSrc) return null;
  return <img src={resolvedSrc} alt={alt} {...props} />;
}
