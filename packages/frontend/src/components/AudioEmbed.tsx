import { useEffect, useRef, useState } from "react";
import { Play, Pause, FileAudio } from "lucide-react";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/apiFetch";
import type { AudioSize } from "@/lib/audioUrl";
import { cn } from "@/lib/utils";

interface Props {
  src: string;
  alt?: string;
  size?: AudioSize;
  projectId?: string;
  isPublic?: boolean;
  /** Forwarded inline style (width/height/align) — only honored on the full-size container. */
  style?: React.CSSProperties;
  className?: string;
}

// Module-level dedup so concurrent renders of the same audio src share one
// fetch (same trick as AuthenticatedImage). Keeps the first render of a doc
// with several copies of one track from spinning N parallel requests.
const inflight = new Map<string, Promise<Blob | null>>();

function getAudioBlob(src: string): Promise<Blob | null> {
  const existing = inflight.get(src);
  if (existing) return existing;
  const p = apiFetch(src).then(r => (r.ok ? r.blob() : null), () => null);
  inflight.set(src, p);
  p.then(() => setTimeout(() => {
    if (inflight.get(src) === p) inflight.delete(src);
  }, 5_000));
  return p;
}

function resolvePublicSrc(src: string, projectId: string | undefined): string {
  let out = src;
  if (out.startsWith("/api/files/")) out = out.replace("/api/files/", "/api/public/files/");
  if (projectId && !out.includes("projectId=")) {
    out += (out.includes("?") ? "&" : "?") + `projectId=${projectId}`;
  }
  return out;
}

export function AudioEmbed({ src, alt, size = "full", projectId, isPublic, style, className }: Props) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);

    const isInternal = src?.startsWith("/api/files/") || src?.startsWith("/api/public/files/");
    if (!isInternal) {
      setResolvedSrc(src ?? null);
      return;
    }

    if (isPublic) {
      setResolvedSrc(resolvePublicSrc(src, projectId));
      return;
    }

    let blobUrl: string | null = null;
    let cancelled = false;
    const fetchSrc = projectId ? `${src}?projectId=${projectId}` : src;
    getAudioBlob(fetchSrc).then(blob => {
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
      <Badge variant="destructive" className="inline-flex items-center gap-1.5 font-normal" title={alt}>
        <FileAudio className="h-3.5 w-3.5 shrink-0" />
        Audio unavailable
      </Badge>
    );
  }

  if (!resolvedSrc) return null;

  if (size === "small") {
    return <AudioSmall src={resolvedSrc} alt={alt} className={className} />;
  }
  return <AudioFull src={resolvedSrc} alt={alt} style={style} className={className} />;
}

function AudioFull({ src, alt, style, className }: { src: string; alt?: string; style?: React.CSSProperties; className?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  return (
    <div className={cn("cm-wysiwyg-audio cm-wysiwyg-audio--full rounded-lg border border-border bg-muted/30 p-4", className)} style={style}>
      <AudioVisualizer audioRef={audioRef} className="mb-3 h-20 text-primary" />
      <audio ref={audioRef} controls src={src} className="w-full" aria-label={alt} />
    </div>
  );
}

function AudioSmall({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  return (
    <span
      className={cn(
        "cm-wysiwyg-audio cm-wysiwyg-audio--small inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-2 py-1 align-middle",
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 translate-x-[0.5px]" />}
      </button>
      <AudioVisualizer
        audioRef={audioRef}
        barCount={5}
        className="h-4 w-12 text-primary"
      />
      {alt ? <span className="max-w-[16ch] truncate text-xs text-muted-foreground">{alt}</span> : null}
      <audio ref={audioRef} src={src} preload="metadata" aria-label={alt} />
    </span>
  );
}
