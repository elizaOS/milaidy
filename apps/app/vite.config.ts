import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const miladyRoot = path.resolve(here, "../..");

// The dev script sets MILADY_API_PORT; default to 31337 for standalone vite dev.
const apiPort = Number(process.env.MILADY_API_PORT) || 31337;

/**
 * Dev-only middleware that handles CORS for Electron's custom-scheme origin
 * (capacitor-electron://-). Vite's proxy doesn't reliably forward CORS headers
 * for non-http origins, so we intercept preflight OPTIONS requests and tag
 * every /api response with the correct headers before the proxy layer.
 */
function electronCorsPlugin(): Plugin {
  return {
    name: "electron-cors",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const origin = req.headers.origin;
        if (!origin || !req.url?.startsWith("/api")) return next();

        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-Milady-Token, X-Api-Key, X-Milady-Export-Token",
        );

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  publicDir: path.resolve(here, "public"),
  plugins: [tailwindcss(), react(), electronCorsPlugin()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      /**
       * Map @milady/capacitor-* packages directly to their TS source.
       * This bypasses resolution issues with local workspace symlinks and
       * outdated bundle exports in the plugins' dist folders.
       */
      {
        find: /^@milady\/capacitor-(.*)/,
        replacement: path.resolve(here, "plugins/$1/src/index.ts"),
      },
      // Allow importing from the milady src (but NOT @milady/capacitor-* plugin packages)
      {
        find: /^@milady(?!\/capacitor-)/,
        replacement: path.resolve(miladyRoot, "src"),
      },
    ],
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: {
        main: path.resolve(here, "index.html"),
      },
    },
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  server: {
    host: true,
    port: 2138,
    strictPort: true,
    cors: {
      origin: true,
      credentials: true,
    },
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://localhost:${apiPort}`,
        ws: true,
      },
    },
    fs: {
      // Allow serving files from the app directory and milady src
      allow: [here, miladyRoot],
    },
    watch: {
      usePolling: true,
    },
  },
});
