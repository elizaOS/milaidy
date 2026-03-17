import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const miladyRoot = path.resolve(here, "../..");
const elizaRoot = path.resolve(miladyRoot, "../eliza");
const hasElizaWorkspace = fs.existsSync(
  path.join(elizaRoot, "packages/autonomous/src/index.ts"),
);
// The dev script sets MILADY_API_PORT; default to 31337 for standalone vite dev.
const apiPort = Number(process.env.MILADY_API_PORT) || 31337;
const enableAppSourceMaps = process.env.MILADY_APP_SOURCEMAP === "1";

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
 * Serves raw VRM and animation files from public_src for the screenshotter.
 * Public ships .vrm.gz and .glb.gz; the screenshotter needs uncompressed .vrm and .glb.
 */
function publicSrcPlugin(): Plugin {
  const publicSrc = path.resolve(here, "public_src");
  const charactersVrm = path.resolve(here, "characters", "vrm");
  const charToIndex: Record<string, number> = {
    Chen: 1,
    Jin: 2,
    Kei: 3,
    Momo: 4,
    Rin: 5,
    Ryu: 6,
    Satoshi: 7,
    Yuki: 8,
  };
  const indexToChar = Object.fromEntries(
    Object.entries(charToIndex).map(([k, v]) => [v, k]),
  );
  return {
    name: "public-src",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        const vrmMatch = url.match(/^\/vrms\/milady-(\d+)\.vrm$/);
        if (vrmMatch) {
          const index = Number(vrmMatch[1]);
          const charName = indexToChar[index];
          const charFile =
            charName && path.join(charactersVrm, `${charName}.vrm`);
          const publicSrcFile = path.join(
            publicSrc,
            "vrms",
            `milady-${index}.vrm`,
          );
          const file =
            charFile && fs.existsSync(charFile) ? charFile : publicSrcFile;
          if (fs.existsSync(file)) {
            res.setHeader("Content-Type", "model/gltf-binary");
            fs.createReadStream(file).pipe(res);
            return;
          }
        }
        if (url === "/animations/idle.glb") {
          const file = path.join(publicSrc, "animations", "idle.glb");
          if (fs.existsSync(file)) {
            res.setHeader("Content-Type", "model/gltf-binary");
            fs.createReadStream(file).pipe(res);
            return;
          }
        }
        if (url.startsWith("/public_src/")) {
          if (url === "/public_src/screenshotter.html") {
            return next();
          }
          const file = path.join(publicSrc, url.slice("/public_src/".length));
          if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            const ext = path.extname(file);
            const types: Record<string, string> = {
              ".html": "text/html",
              ".png": "image/png",
              ".jpg": "image/jpeg",
            };
            if (types[ext]) res.setHeader("Content-Type", types[ext]);
            fs.createReadStream(file).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

function sparkWasmDataUrlPlugin(): Plugin {
  return {
    name: "spark-wasm-data-url",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@sparkjsdev/spark/dist/spark.module.js")) return null;
      const patched = code.replace(
        /new URL\(("(?:data:application\/wasm;base64,[^"]+)"),\s*import\.meta\.url\)/g,
        "$1",
      );
      if (patched === code) return null;
      return {
        code: patched,
        map: null,
      };
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  publicDir: path.resolve(here, "public"),
  plugins: [
    publicSrcPlugin(),
    sparkWasmDataUrlPlugin(),
    tailwindcss(),
    react(),
    electronCorsPlugin(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "three", "@sparkjsdev/spark"],
    alias: [
      /**
       * Map @miladyai/capacitor-* and @elizaos/capacitor-* packages directly
       * to their TS source. This bypasses resolution issues with local
       * workspace symlinks and outdated bundle exports in the plugins' dist
       * folders.
       */
      {
        find: /^@(?:miladyai|elizaos)\/capacitor-(.*)/,
        replacement: path.resolve(here, "plugins/$1/src/index.ts"),
      },
      // @elizaos/* → eliza submodule packages (only when workspace is present)
      ...(hasElizaWorkspace
        ? [
            {
              find: /^@elizaos\/autonomous$/,
              replacement: path.resolve(
                elizaRoot,
                "packages/autonomous/src/index.ts",
              ),
            },
            {
              find: /^@elizaos\/autonomous\/(.*)$/,
              replacement: path.resolve(
                elizaRoot,
                "packages/autonomous/src/$1",
              ),
            },
            {
              find: /^@elizaos\/app-core$/,
              replacement: path.resolve(
                elizaRoot,
                "packages/app-core/src/index.ts",
              ),
            },
            {
              find: /^@elizaos\/app-core\/(.*)$/,
              replacement: path.resolve(
                elizaRoot,
                "packages/app-core/src/$1",
              ),
            },
            {
              find: /^@elizaos\/ui$/,
              replacement: path.resolve(
                elizaRoot,
                "packages/ui/src/index.ts",
              ),
            },
            {
              find: /^@elizaos\/ui\/(.*)$/,
              replacement: path.resolve(elizaRoot, "packages/ui/src/$1"),
            },
          ]
        : []),
      // @miladyai/* → milady local packages
      {
        find: /^@miladyai\/autonomous$/,
        replacement: path.resolve(
          miladyRoot,
          "packages/autonomous/src/index.ts",
        ),
      },
      {
        find: /^@miladyai\/autonomous\/(.*)$/,
        replacement: path.resolve(miladyRoot, "packages/autonomous/src/$1"),
      },
      {
        find: /^@miladyai\/app-core$/,
        replacement: path.resolve(miladyRoot, "packages/app-core/src/index.ts"),
      },
      {
        find: /^@miladyai\/app-core\/(.*)$/,
        replacement: path.resolve(miladyRoot, "packages/app-core/src/$1"),
      },
      {
        find: /^@miladyai\/ui$/,
        replacement: path.resolve(miladyRoot, "packages/ui/src/index.ts"),
      },
      {
        find: /^@miladyai\/ui\/(.*)$/,
        replacement: path.resolve(miladyRoot, "packages/ui/src/$1"),
      },
      // Allow importing from the milady src (but NOT workspace packages)
      {
        find: /^@(?:miladyai|elizaos)(?!\/(?:autonomous|capacitor-|app-core|ui))/,
        replacement: path.resolve(miladyRoot, "src"),
      },
    ],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "three"],
    exclude: ["@sparkjsdev/spark"],
  },
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: enableAppSourceMaps,
    target: "es2022",
    rollupOptions: {
      input: {
        main: path.resolve(here, "index.html"),
        screenshotter: path.resolve(here, "public_src/screenshotter.html"),
      },
      output: {
        manualChunks: {
          "vendor-3d": ["three", "@pixiv/three-vrm", "@sparkjsdev/spark"],
        },
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
      // Allow serving files from the app directory, milady src, and eliza src
      allow: [here, miladyRoot, elizaRoot],
    },
    watch: {
      // Polling is only needed in Docker/WSL where native fs events are unreliable
      usePolling: process.env.MILADY_DEV_POLLING === "1",
    },
  },
});
