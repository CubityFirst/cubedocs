import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: isDev ? "CubeDocs (Dev)" : "CubeDocs",
          short_name: isDev ? "CubeDocs Dev" : "CubeDocs",
          description: "Documentation and password vault",
          start_url: "/",
          display: "standalone",
          background_color: "#09090b",
          theme_color: "#09090b",
          icons: isDev
            ? [
                { src: "/icon-192-dev.png", sizes: "192x192", type: "image/png" },
                { src: "/icon-512-dev.png", sizes: "512x512", type: "image/png" },
                { src: "/icon-512-dev.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
              ]
            : [
                { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
                { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
                { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
              ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:8787",
          rewrite: path => path.replace(/^\/api/, ""),
        },
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
