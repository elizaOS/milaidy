import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
  getAppCoreConnectionStepEntry,
  getAppCoreOnboardingConfigEntry,
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  resolveModuleEntry,
} from "./test/eliza-package-paths";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const elizaCoreEntry = getElizaCoreEntry(repoRoot);
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);
const appCoreAliasRoot =
  path.basename(appCoreSourceRoot ?? "") === "src"
    ? appCoreSourceRoot
    : undefined;
const appCoreConnectionStepEntry = getAppCoreConnectionStepEntry(repoRoot);
const appCoreOnboardingConfigEntry = getAppCoreOnboardingConfigEntry(repoRoot);
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const isWindows = process.platform === "win32";
const localWorkers = 2;
const ciWorkers = isWindows ? 2 : 3;

export default defineConfig({
  plugins: [
    {
      name: "app-core-identity-step-override",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "./onboarding/IdentityStep" &&
          importer?.includes("@elizaos/app-core") &&
          importer.endsWith("/OnboardingWizard.tsx")
        ) {
          return path.join(
            repoRoot,
            "apps",
            "app",
            "src",
            "components",
            "IdentityStep.tsx",
          );
        }
        return null;
      },
    },
    {
      name: "app-core-onboarding-config-override",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "../onboarding-config" &&
          importer?.includes("app-core") &&
          importer.includes("/state/")
        ) {
          return path.join(
            repoRoot,
            "apps",
            "app",
            "src",
            "onboarding-config.ts",
          );
        }
        return null;
      },
    },
    {
      name: "app-core-theme-toggle-override",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "./ThemeToggle" &&
          importer?.includes("app-core") &&
          importer.includes("/components/index.ts")
        ) {
          return path.join(
            repoRoot,
            "apps",
            "app",
            "src",
            "components",
            "ThemeToggle.tsx",
          );
        }
        return null;
      },
    },
  ],
  resolve: {
    dedupe: ["react", "react-dom", "ethers", "@elizaos/core"],
    alias: [
      {
        find: "milady/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      },
      // Resolve key @elizaos packages to the installed npm tarball files so
      // Vitest does not depend on sibling workspace checkouts or package
      // export quirks.
      ...(elizaCoreEntry
        ? [
            {
              find: "@elizaos/core",
              replacement: elizaCoreEntry,
            },
          ]
        : []),
      ...(autonomousSourceRoot
        ? [
            {
              find: /^@elizaos\/autonomous\/(.*)/,
              replacement: path.join(autonomousSourceRoot, "$1"),
            },
            {
              find: "@elizaos/autonomous",
              replacement: resolveModuleEntry(
                path.join(autonomousSourceRoot, "index"),
              ),
            },
          ]
        : []),
      ...(appCoreConnectionStepEntry
        ? [
            {
              find: "@milady/upstream-app-core-connection-step",
              replacement: appCoreConnectionStepEntry,
            },
          ]
        : []),
      ...(appCoreOnboardingConfigEntry
        ? [
            {
              find: "@milady/upstream-app-core-onboarding-config",
              replacement: appCoreOnboardingConfigEntry,
            },
          ]
        : []),
      ...(appCoreAliasRoot
        ? [
            {
              find: "@elizaos/app-core/bridge/electrobun-rpc",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
            {
              find: "@elizaos/app-core/bridge/electrobun-runtime",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
            {
              find: "@elizaos/app-core/bridge",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
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
        : appCoreSourceRoot
          ? []
          : [
              {
                // Stub app-core when workspace is absent — its npm dist has
                // extensionless JS imports that break under vitest/vite.
                find: /^@elizaos\/app-core(\/.*)?$/,
                replacement: path.join(
                  repoRoot,
                  "test",
                  "stubs",
                  "plugin-stub.mjs",
                ),
              },
            ]),
    ],
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: isWindows ? 180_000 : 120_000,
    pool: "forks",
    maxWorkers: isCI ? ciWorkers : localWorkers,
    restoreMocks: true,
    // Increase V8 heap for worker forks to prevent OOM during GC
    // teardown, especially for jsdom-heavy test files.
    execArgv: ["--max-old-space-size=4096"],
    include: [
      "packages/autonomous/src/**/*.test.ts",
      "packages/autonomous/src/**/*.test.tsx",
      "packages/autonomous/test/**/*.test.ts",
      "packages/autonomous/test/**/*.test.tsx",
      "packages/app-core/src/**/*.test.ts",
      "packages/app-core/test/**/*.test.ts",
      "packages/app-core/test/**/*.test.tsx",
      "packages/plugin-retake/src/**/*.test.ts",
      "src/**/*.test.ts",
      "scripts/**/*.test.ts",
      "apps/app/test/**/*.test.ts",
      "apps/app/test/**/*.test.tsx",
      "apps/app/electrobun/src/**/*.test.ts",
      "apps/app/electrobun/src/**/*.test.tsx",
      "apps/chrome-extension/**/*.test.ts",
      "apps/chrome-extension/**/*.test.tsx",
      "apps/app/test/app/api-client-timeout.test.ts",
      "test/api-server.e2e.test.ts",
      "test/format-error.test.ts",
      "test/trajectory-database.e2e.test.ts",
      "test/agent-restart-recovery.e2e.test.ts",
      "test/knowledge-e2e-flow.e2e.test.ts",
      "test/trigger-execution-flow.e2e.test.ts",
      "test/terminal-execution.e2e.test.ts",
      "test/config-hot-reload.e2e.test.ts",
      "test/health-endpoint.e2e.test.ts",
    ],
    setupFiles: ["test/setup.ts"],
    exclude: ["dist/**", "**/node_modules/**", "**/*.live.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 25,
        functions: 25,
        branches: 15,
        statements: 25,
      },
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Entrypoints and wiring (covered by CI smoke + manual/e2e flows).
        "src/entry.ts",
        "src/index.ts",
        "src/cli/**",
        "src/hooks/**",
      ],
    },
    server: {
      deps: {
        inline: [
          "@elizaos/core",
          "@elizaos/autonomous",
          "@elizaos/app-core",
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
