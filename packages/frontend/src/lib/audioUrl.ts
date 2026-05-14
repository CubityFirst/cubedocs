// Detect whether a URL points at an audio file, so the same ![](…) markdown
// syntax can dispatch to either an <img> renderer or an audio embed renderer.

const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus"]);

export function isAudioUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const clean = url.split("?")[0]!.split("#")[0]!;
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return !!m && AUDIO_EXTS.has(m[1]!.toLowerCase());
}

export type AudioSize = "full" | "small";

export function parseAudioSize(value: string | undefined | null): AudioSize {
  return value === "small" ? "small" : "full";
}
