export interface Env {
  API: Fetcher;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Proxy /api/* to the API worker via Service Binding
    if (url.pathname.startsWith("/api/")) {
      const apiUrl = new URL(url.pathname.replace(/^\/api/, "") || "/", "https://api");
      apiUrl.search = url.search;
      return env.API.fetch(new Request(apiUrl.toString(), request));
    }

    // Serve static assets; fall through to index.html for SPA routing
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url).toString(), request));
  },
};
