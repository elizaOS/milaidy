import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import {
  getAppCoreSourceRoot,
  resolveModuleEntry,
} from "../../test/eliza-package-paths";

const here = path.dirname(fileURLToPath(import.meta.url));
const appCorePackageRoot = getAppCoreSourceRoot(here);

const bridgeStubPath = path.join(
  here,
  "..",
  "..",
  "test",
  "stubs",
  "app-core-bridge.ts",
);

/**
 * Custom Vite plugin that redirects @miladyai/app-core/bridge imports to
 * the test stub before Vite's built-in resolver tries to resolve through
 * the package's exports map (which may reference native bindings that are
 * unavailable in the test environment).
 */
function appCoreBridgeStubPlugin(): Plugin {
  return {
    name: "app-core-bridge-stub",
    enforce: "pre",
    resolveId(source) {
      if (
        source === "@miladyai/app-core/bridge/electrobun-rpc" ||
        source === "@miladyai/app-core/bridge/electrobun-runtime" ||
        source === "@miladyai/app-core/bridge"
      ) {
        return bridgeStubPath;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [appCoreBridgeStubPlugin()],
  resolve: {
    alias: [
      {
        find: "react",
        replacement: path.join(here, "node_modules/react"),
      },
      {
        find: "react-dom",
        replacement: path.join(here, "node_modules/react-dom"),
      },
      ...(appCorePackageRoot
        ? (() => {
            const appCorePkgPath = path.resolve(
              appCorePackageRoot,
              "..",
              "package.json",
            );
            const appCorePkg = JSON.parse(
              fs.readFileSync(appCorePkgPath, "utf8"),
            );
            const generatedAliases = [];
            for (const [key, value] of Object.entries(
              appCorePkg.exports || {},
            )) {
              if (typeof value === "string") {
                const aliasKey =
                  key === "."
                    ? "@miladyai/app-core"
                    : `@miladyai/app-core/${key.replace(/^\.\//, "")}`;
                const targetPath = path.resolve(
                  appCorePackageRoot,
                  "..",
                  value,
                );

                generatedAliases.push({
                  find: new RegExp(`^${aliasKey}$`),
                  replacement: targetPath,
                });
                if (!aliasKey.endsWith(".js") && !aliasKey.endsWith(".css")) {
                  generatedAliases.push({
                    find: new RegExp(`^${aliasKey}\\.js$`),
                    replacement: targetPath,
                  });
                }
              }
            }
            return generatedAliases;
          })()
        : []),
    ],
  },
  test: {
    // Use POSIX-style relative globs so test discovery works on Windows too.
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: [path.join(here, "test/setup.ts")],
    environment: "node",
    alias: {
      "@elizaos/skills": path.join(here, "test/__mocks__/elizaos-skills.ts"),
      "@miladyai/capacitor-gateway": path.join(
        here,
        "plugins/gateway/src/index.ts",
      ),
      "@miladyai/capacitor-swabble": path.join(
        here,
        "plugins/swabble/src/index.ts",
      ),
      "@miladyai/capacitor-talkmode": path.join(
        here,
        "plugins/talkmode/src/index.ts",
      ),
      "@miladyai/capacitor-camera": path.join(
        here,
        "plugins/camera/src/index.ts",
      ),
      "@miladyai/capacitor-location": path.join(
        here,
        "plugins/location/src/index.ts",
      ),
      "@miladyai/capacitor-screencapture": path.join(
        here,
        "plugins/screencapture/src/index.ts",
      ),
      "@miladyai/capacitor-canvas": path.join(
        here,
        "plugins/canvas/src/index.ts",
      ),
      "@miladyai/capacitor-desktop": path.join(
        here,
        "plugins/desktop/src/index.ts",
      ),
      "@miladyai/capacitor-agent": path.join(
        here,
        "plugins/agent/src/index.ts",
      ),
    },
    testTimeout: 30000,
    globals: true,
    server: {
      deps: {
        inline: ["@miladyai/app-core"],
      },
    },
  },
});
