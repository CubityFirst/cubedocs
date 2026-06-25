import { Image, Music, Video, FileCode, FileArchive, FileText, File } from "lucide-react";
import { fileKind } from "@/lib/fileKind";

/**
 * Icon for a stored file, chosen from its kind (see lib/fileKind). Shared by the
 * file listing, the file viewer, and the public site so the mapping can't drift.
 * Pass `name` alongside `mimeType` so extension-based detection works for files
 * the browser mis-typed (e.g. a `.ts` source arriving as video/mp2t).
 */
export function FileTypeIcon({ mimeType, name, className }: { mimeType: string; name?: string; className?: string }) {
  switch (fileKind(mimeType, name)) {
    case "image": return <Image className={className} />;
    case "audio": return <Music className={className} />;
    case "video": return <Video className={className} />;
    case "pdf": return <FileText className={className} />;
    case "text": return <FileCode className={className} />;
    case "archive": return <FileArchive className={className} />;
    default: return <File className={className} />;
  }
}
