export interface Env {
  API: Fetcher; // Service binding to cubedocs-api
  API_BASE_URL: string;
  ASSETS: Fetcher; // Injected automatically when [assets] is configured
}

// The Worker's job is to serve the SPA shell and handle any SSR routes.
// Static assets (JS, CSS, images) are served automatically by the Assets binding.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Pass API calls through to the API worker
    if (url.pathname.startsWith("/api/")) {
      const apiUrl = new URL(url.pathname.replace(/^\/api/, ""), "https://api");
      apiUrl.search = url.search;
      return env.API.fetch(new Request(apiUrl.toString(), request));
    }

    // Let the assets binding handle static files first
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    // Fall through to SPA shell for all other routes (client-side routing)
    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url).toString(), request));
  },
};
