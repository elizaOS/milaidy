import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import {
  getAppCoreConnectionStepEntry,
  getAppCoreOnboardingConfigEntry,
  getAppCoreSourceRoot,
  resolveModuleEntry,
} from "../../test/eliza-package-paths";

const here = path.dirname(fileURLToPath(import.meta.url));
const appCoreSourceRoot = getAppCoreSourceRoot(here);
const appCoreAliasRoot =
  path.basename(appCoreSourceRoot ?? "") === "src"
    ? appCoreSourceRoot
    : undefined;
const upstreamConnectionStepPath = getAppCoreConnectionStepEntry(here);
const upstreamOnboardingConfigPath = getAppCoreOnboardingConfigEntry(here);

const bridgeStubPath = path.join(
  here,
  "..",
  "..",
  "test",
  "stubs",
  "app-core-bridge.ts",
);

/**
 * Custom Vite plugin that redirects @elizaos/app-core/bridge imports to
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
        source === "@elizaos/app-core/bridge/electrobun-rpc" ||
        source === "@elizaos/app-core/bridge/electrobun-runtime" ||
        source === "@elizaos/app-core/bridge"
      ) {
        return bridgeStubPath;
      }
      return null;
    },
  };
}

function appCoreOnboardingConfigOverridePlugin(): Plugin {
  const miladyOnboardingConfig = path.join(here, "src", "onboarding-config.ts");
  return {
    name: "app-core-onboarding-config-override",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "../onboarding-config" &&
        importer?.includes("app-core") &&
        importer.includes("/state/")
      ) {
        return miladyOnboardingConfig;
      }
      return null;
    },
  };
}

function appCoreIdentityStepOverridePlugin(): Plugin {
  const miladyIdentityStep = path.join(
    here,
    "src",
    "components",
    "IdentityStep.tsx",
  );
  return {
    name: "app-core-identity-step-override",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "./onboarding/IdentityStep" &&
        importer?.includes("@elizaos/app-core") &&
        importer.endsWith("/OnboardingWizard.tsx")
      ) {
        return miladyIdentityStep;
      }
      return null;
    },
  };
}

function appCoreThemeToggleOverridePlugin(): Plugin {
  const miladyThemeToggle = path.join(
    here,
    "src",
    "components",
    "ThemeToggle.tsx",
  );
  return {
    name: "app-core-theme-toggle-override",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "./ThemeToggle" &&
        importer?.includes("app-core") &&
        importer.includes("/components/index.ts")
      ) {
        return miladyThemeToggle;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    appCoreBridgeStubPlugin(),
    appCoreIdentityStepOverridePlugin(),
    appCoreOnboardingConfigOverridePlugin(),
    appCoreThemeToggleOverridePlugin(),
  ],
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
      ...(upstreamConnectionStepPath
        ? [
            {
              find: "@milady/upstream-app-core-connection-step",
              replacement: upstreamConnectionStepPath,
            },
          ]
        : []),
      ...(upstreamOnboardingConfigPath
        ? [
            {
              find: "@milady/upstream-app-core-onboarding-config",
              replacement: upstreamOnboardingConfigPath,
            },
          ]
        : []),
      ...(appCoreAliasRoot
        ? [
            {
              find: /^@elizaos\/app-core\/(.*)/,
              replacement: path.join(appCoreAliasRoot, "$1"),
            },
            {
              find: "@elizaos/app-core",
              replacement: resolveModuleEntry(
                path.join(appCoreAliasRoot, "index"),
              ),
            },
          ]
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
        inline: ["@elizaos/app-core"],
      },
    },
  },
});
