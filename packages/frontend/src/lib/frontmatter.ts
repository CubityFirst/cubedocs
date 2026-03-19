export interface Frontmatter {
  sidebar_position?: number;
  title?: string;
  hide_title?: boolean;
}

const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

export function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(FM_REGEX);
  if (!match) return {};
  const result: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key === "sidebar_position") {
      const n = Number(val);
      if (!isNaN(n)) result.sidebar_position = n;
    } else if (key === "title") {
      result.title = val.replace(/^['"]|['"]$/g, "");
    } else if (key === "hide_title") {
      result.hide_title = val === "true";
    }
  }
  return result;
}
