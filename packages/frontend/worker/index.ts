export interface Env {
  API: Fetcher;
  ASSETS: Fetcher;
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

      // Serve static assets; fall through to index.html for SPA routing
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.ok) return assetResponse;

      return await env.ASSETS.fetch(new Request(new URL("/", request.url).toString(), request));
    } catch {
      return new Response("404 Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }
  },
};
