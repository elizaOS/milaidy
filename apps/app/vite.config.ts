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
          "Content-Type, Authorization, X-Milady-Token, X-Api-Key, X-Milady-Export-Token, X-Milady-Client-Id, X-Milady-Terminal-Token, X-Milady-UI-Language",
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

/**
 * When served behind a path-stripping reverse proxy (e.g. Railway's
 * /proxy/PORT/), Vite injects absolute paths like `/@vite/client` and
 * `/@react-refresh` that the browser resolves against the root domain,
 * bypassing the proxy prefix.  This plugin:
 *  1. Rewrites HTML-injected paths to relative (transformIndexHtml).
 *  2. Intercepts JS responses via middleware to rewrite absolute `/@…`
 *     imports to relative `./@…` so the browser resolves them through
 *     the proxy prefix.
 */
function proxyRelativePathsPlugin(): Plugin {
  const needsRewrite = !!process.env.VSCODE_PROXY_URI;
  if (!needsRewrite) return { name: "proxy-relative-paths-noop" };

  const ABS_IMPORT_RE = /((?:from|import)\s*["'])\/@/g;

  return {
    name: "proxy-relative-paths",
    enforce: "post",
    transformIndexHtml(html) {
      return html
        .replace(ABS_IMPORT_RE, "$1./@")
        .replace(/(src=["'])\/@/g, "$1./@");
    },
    configureServer(server) {
      // Intercept JS module responses (/@vite/client, /@react-refresh, etc.)
      // and rewrite absolute /@… imports to relative ./@… paths.
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        // Only intercept Vite internal module requests
        if (!url.startsWith("/@")) return next();

        const origWrite = res.write.bind(res);
        const origEnd = res.end.bind(res);
        const chunks: Buffer[] = [];

        res.write = function (chunk: unknown, ...args: unknown[]) {
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
          return true;
        } as typeof res.write;

        res.end = function (chunk?: unknown, ...args: unknown[]) {
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
          const body = Buffer.concat(chunks).toString("utf-8");
          const ct = res.getHeader("content-type") ?? "";
          if (typeof ct === "string" && (ct.includes("javascript") || ct.includes("application/json"))) {
            const rewritten = body.replace(ABS_IMPORT_RE, "$1./@");
            res.removeHeader("content-length");
            origEnd.call(res, rewritten);
          } else {
            origEnd.call(res, Buffer.concat(chunks));
          }
        } as typeof res.end;

        next();
      });
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  publicDir: path.resolve(here, "public"),
  plugins: [tailwindcss(), react(), electronCorsPlugin(), proxyRelativePathsPlugin()],
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
      // Allow importing from the milady src (but NOT workspace packages)
      {
        find: /^@milady(?!\/(capacitor-|app-core|ui))/,
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
    allowedHosts: true,
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
