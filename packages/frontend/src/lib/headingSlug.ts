export function toHeadingId(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

/**
 * Find the 1-indexed line number of the heading whose slug matches `hash`.
 * Parses the raw markdown text directly so it's robust against:
 *   - CodeMirror viewport virtualisation (the line may not be in the DOM)
 *   - Lezer parse failures (the heading may not have its ATXHeading tag)
 * Returns -1 if no heading matches.
 */
export function findHeadingLine(content: string, hash: string): number {
  const lines = content.split("\n");
  let inFrontmatter = false;
  let frontmatterDone = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.trimEnd() === "---") { inFrontmatter = true; continue; }
    if (inFrontmatter && !frontmatterDone) {
      if (line.trimEnd() === "---") { inFrontmatter = false; frontmatterDone = true; }
      continue;
    }
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m && toHeadingId(m[2].trim()) === hash) return i + 1;
  }
  return -1;
}
