// Shared Pandoc-style image attribute parser:
//   ![alt](url){width=50% height=200px}
//
// Supported attributes: width, height (quoted or unquoted values).

// Matches a Pandoc attribute block at the start of a string: {key=val …}
export const ATTR_BLOCK_RE = /^\{([^}]*)\}/;

// Matches a single key="value" or key=value pair
const KV_RE = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;

export function parseImageAttrs(block: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  KV_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KV_RE.exec(block)) !== null) {
    const key = m[1]!;
    const val = m[2] ?? m[3] ?? m[4]!;
    attrs[key] = val;
  }
  return attrs;
}

export function styleFromAttrs(attrs: Record<string, string>): string | undefined {
  const { width, height } = attrs;
  if (!width && !height) return undefined;
  const parts: string[] = [];
  if (width) parts.push(`width: ${width}`);
  if (height) parts.push(`height: ${height}`);
  return parts.join("; ");
}
