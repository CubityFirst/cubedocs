// Shared Pandoc-style image attribute parser:
//   ![alt](url){width=50% height=200px}
//
// Supported attributes: width, height (quoted or unquoted values).

// Matches a Pandoc attribute block at the start of a string: {key=val …}.
// `[^}\n]` (not `[^}]`) so an unfinished `{…` on one line doesn't greedily
// gobble across newlines until it finds a `}` from a later line.
export const ATTR_BLOCK_RE = /^\{([^}\n]*)\}/;

// Matches an INCOMPLETE attribute block at the start: an opening `{` with
// no closing `}` before the end of the line. Used so the visitor can consume
// the partial text while the user is still typing — otherwise the rendered
// image and the unfinished `{…` show side-by-side. Multiline `m` so `$`
// matches end-of-line within the lookahead slice.
export const PARTIAL_ATTR_BLOCK_RE = /^\{[^}\n]*$/m;

// Matches a single key="value" or key=value pair
const KV_RE = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;

// Bare numeric value (integer or decimal) — defaults to px so `width=200`
// behaves the same as `width=200px`.
const UNITLESS_NUMERIC_RE = /^\d+(?:\.\d+)?$/;

export function parseImageAttrs(block: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  KV_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KV_RE.exec(block)) !== null) {
    const key = m[1]!;
    let val = m[2] ?? m[3] ?? m[4]!;
    if (UNITLESS_NUMERIC_RE.test(val)) val = `${val}px`;
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
