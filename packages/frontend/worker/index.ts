export interface Env {
  API: Fetcher;
  ASSETS: Fetcher;
}

function extractFirstParagraph(content: string, maxLength = 160): string {
  const lines = content.split("\n");
  let inFrontmatter = false;
  let frontmatterDone = false;
  let inCodeBlock = false;
  const paragraphLines: string[] = [];
  let inParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === 0 && line.trimEnd() === "---") { inFrontmatter = true; continue; }
    if (inFrontmatter && !frontmatterDone) {
      if (line.trimEnd() === "---") { inFrontmatter = false; frontmatterDone = true; }
      continue;
    }

    const trimmed = line.trim();

    if (trimmed.startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;
    if (trimmed.startsWith("#")) continue;
    if (/^[-*=]{3,}$/.test(trimmed)) continue;
    if (trimmed.startsWith(">") || trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\. /.test(trimmed)) continue;

    if (trimmed === "") {
      if (inParagraph) break;
      continue;
    }

    inParagraph = true;
    paragraphLines.push(trimmed);
  }

  if (paragraphLines.length === 0) return "";

  let text = paragraphLines.join(" ");
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[\[([^\]|]+)\|?[^\]]*\]\]/g, "$1");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/__(.+?)__/g, "$1");
  text = text.replace(/\*(.+?)\*/g, "$1");
  text = text.replace(/_(.+?)_/g, "$1");
  text = text.replace(/`(.+?)`/g, "$1");
  text = text.trim();

  if (text.length > maxLength) text = text.slice(0, maxLength - 1) + "…";
  return text;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Proxy /api/* to the API worker via Service Binding
      if (url.pathname.startsWith("/api/")) {
        const apiUrl = new URL(url.pathname.replace(/^\/api/, "") || "/", "https://api");
        apiUrl.search = url.search;
        return await env.API.fetch(new Request(apiUrl.toString(), request));
      }

      // Inject OG metadata for share links
      const shareMatch = url.pathname.match(/^\/s\/([^/]+)\/([^/]+)$/);
      if (shareMatch) {
        const [, projectSlug, docId] = shareMatch;
        try {
          const cache = caches.default;
          const cacheKey = new Request(`https://share-meta.internal/${projectSlug}/${docId}`);
          const cached = await cache.match(cacheKey);
          if (cached) return cached;

          const metaRes = await env.API.fetch(
            new Request(`https://api/public/docs/${projectSlug}/${docId}`, { method: "GET" }),
          );
          if (metaRes.ok) {
            const json = await metaRes.json<{
              ok: boolean;
              data?: {
                doc: { title: string; display_title: string | null; content: string };
                project: { name: string };
              };
            }>();
            if (json.ok && json.data) {
              const { doc, project } = json.data;
              const docTitle = doc.display_title ?? doc.title;
              const pageTitle = `${docTitle} - ${project.name}`;
              const description = extractFirstParagraph(doc.content);

              const indexRes = await env.ASSETS.fetch(
                new Request(new URL("/", request.url).toString(), request),
              );
              if (indexRes.ok) {
                let html = await indexRes.text();
                html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`);
                const ogTags = [
                  `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`,
                  description ? `<meta property="og:description" content="${escapeHtml(description)}" />` : "",
                  description ? `<meta name="description" content="${escapeHtml(description)}" />` : "",
                ].filter(Boolean).join("\n");
                html = html.replace(/<\/head>/, `${ogTags}\n</head>`);
                const response = new Response(html, {
                  status: 200,
                  headers: {
                    "Content-Type": "text/html; charset=UTF-8",
                    "Cache-Control": "public, max-age=43200",
                  },
                });
                await cache.put(cacheKey, response.clone());
                return response;
              }
            }
          }
        } catch {
          // Fall through to normal asset serving
        }
      }

      // Serve static assets; fall through to index.html for SPA routing
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.ok) return assetResponse;

      return await env.ASSETS.fetch(new Request(new URL("/", request.url).toString(), request));
    } catch {
      return new Response("404 Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }
  },
};
