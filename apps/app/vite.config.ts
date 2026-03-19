import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { getAppCoreSourceRoot } from "../../test/eliza-package-paths";
import { MILADY_CHARACTER_ASSETS } from "./src/character-catalog";

const here = path.dirname(fileURLToPath(import.meta.url));
const miladyRoot = path.resolve(here, "../..");
const appCoreRoot = getAppCoreSourceRoot(miladyRoot);
const upstreamConnectionStep = path.resolve(
  appCoreRoot ?? here,
  "components/onboarding/ConnectionStep.tsx",
);
const upstreamOnboardingConfig = path.resolve(
  appCoreRoot ?? here,
  "onboarding-config.ts",
);

// The dev script sets MILADY_API_PORT; default to 31337 for standalone vite dev.
const apiPort = Number(process.env.MILADY_API_PORT) || 31337;
const enableAppSourceMaps = process.env.MILADY_APP_SOURCEMAP === "1";

/**
 * Dev-only middleware that handles CORS for the desktop custom-scheme origin
 * (electrobun://-). Vite's proxy doesn't reliably forward CORS headers
 * for non-http origins, so we intercept preflight OPTIONS requests and tag
 * every /api response with the correct headers before the proxy layer.
 */
function desktopCorsPlugin(): Plugin {
  return {
    name: "desktop-cors",
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
  const assetById = new Map(
    MILADY_CHARACTER_ASSETS.map((asset) => [asset.id, asset]),
  );
  return {
    name: "public-src",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        const vrmMatch = url.match(/^\/vrms\/milady-(\d+)\.vrm$/);
        if (vrmMatch) {
          const index = Number(vrmMatch[1]);
          const asset = assetById.get(index);
          const charFile =
            asset && path.join(charactersVrm, asset.sourceVrmFilename);
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
        if (url.startsWith("/animations/") && url.endsWith(".glb")) {
          const file = path.join(publicSrc, url.slice(1)); // url is /animations/..., slice(1) makes it animations/...
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

/**
 * Redirects the upstream @elizaos/app-core CharacterRoster to milady's
 * version so CharacterView picks up the correct preset meta (catchphrases,
 * avatar indices, character names).
 */
function characterOverridePlugin(): Plugin {
  const miladyRoster = path.resolve(here, "src/components/CharacterRoster.tsx");
  const miladyEditor = path.resolve(here, "src/components/CharacterEditor.tsx");
  return {
    name: "milady-character-override",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !importer.includes("app-core")) return;
      if (!importer.includes("components/") && !importer.includes("App.tsx"))
        return;
      if (source === "./CharacterRoster") return miladyRoster;
      if (source === "./CharacterView") return miladyEditor;
    },
  };
}

function onboardingConnectionOverridePlugin(): Plugin {
  const miladyConnectionStep = path.resolve(
    here,
    "src/components/ConnectionStep.tsx",
  );
  return {
    name: "milady-onboarding-connection-override",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "./onboarding/ConnectionStep" &&
        importer?.includes("@elizaos/app-core") &&
        importer.endsWith("/OnboardingWizard.tsx")
      ) {
        return miladyConnectionStep;
      }
    },
  };
}

function onboardingIdentityOverridePlugin(): Plugin {
  const miladyIdentityStep = path.resolve(
    here,
    "src/components/IdentityStep.tsx",
  );
  return {
    name: "milady-onboarding-identity-override",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "./onboarding/IdentityStep" &&
        importer?.includes("@elizaos/app-core") &&
        importer.endsWith("/OnboardingWizard.tsx")
      ) {
        return miladyIdentityStep;
      }
    },
  };
}

function onboardingConfigOverridePlugin(): Plugin {
  const miladyOnboardingConfig = path.resolve(here, "src/onboarding-config.ts");
  return {
    name: "milady-onboarding-config-override",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "../onboarding-config" &&
        importer?.includes("app-core") &&
        importer.includes("/state/")
      ) {
        return miladyOnboardingConfig;
      }
    },
  };
}

function themeToggleOverridePlugin(): Plugin {
  const miladyThemeToggle = path.resolve(
    here,
    "src/components/ThemeToggle.tsx",
  );
  return {
    name: "milady-theme-toggle-override",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "./ThemeToggle" &&
        importer?.includes("app-core") &&
        importer.includes("/components/index.ts")
      ) {
        return miladyThemeToggle;
      }
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
    characterOverridePlugin(),
    onboardingIdentityOverridePlugin(),
    onboardingConnectionOverridePlugin(),
    onboardingConfigOverridePlugin(),
    themeToggleOverridePlugin(),
    publicSrcPlugin(),
    sparkWasmDataUrlPlugin(),
    tailwindcss(),
    react(),
    desktopCorsPlugin(),
  ],
  esbuild: {
    // Override tsconfig target — some extended configs use ES2024 which older
    // esbuild does not recognize; this avoids "Unrecognized target environment"
    // warnings regardless of tsconfig resolution.
    target: "es2022",
  },
  resolve: {
    dedupe: ["react", "react-dom", "three", "@sparkjsdev/spark"],
    alias: [
      // Capacitor plugins — resolve to local plugin sources
      {
        find: /^@miladyai\/capacitor-agent$/,
        replacement: path.resolve(here, "plugins/agent/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-camera$/,
        replacement: path.resolve(here, "plugins/camera/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-canvas$/,
        replacement: path.resolve(here, "plugins/canvas/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-desktop$/,
        replacement: path.resolve(here, "plugins/desktop/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-gateway$/,
        replacement: path.resolve(here, "plugins/gateway/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-location$/,
        replacement: path.resolve(here, "plugins/location/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-screencapture$/,
        replacement: path.resolve(here, "plugins/screencapture/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-swabble$/,
        replacement: path.resolve(here, "plugins/swabble/src/index.ts"),
      },
      {
        find: /^@miladyai\/capacitor-talkmode$/,
        replacement: path.resolve(here, "plugins/talkmode/src/index.ts"),
      },
      {
        find: /^@milady\/upstream-app-core-connection-step$/,
        replacement: upstreamConnectionStep,
      },
      {
        find: /^@milady\/upstream-app-core-onboarding-config$/,
        replacement: upstreamOnboardingConfig,
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
      // Allow serving files from the app directory and milady src
      allow: [here, miladyRoot],
    },
    watch: {
      // Polling is only needed in Docker/WSL where native fs events are unreliable
      usePolling: process.env.MILADY_DEV_POLLING === "1",
    },
  },
});
