import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  resolveModuleEntry,
} from "./test/eliza-package-paths";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const elizaCoreEntry = getElizaCoreEntry(repoRoot);
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const isWindows = process.platform === "win32";
const localWorkers = 2;
const ciWorkers = isWindows ? 2 : 3;

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "ethers"],
    alias: [
      {
        find: "milady/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      },
      // When the eliza workspace exists locally, resolve @elizaos packages from
      // source so that all transitive imports share a single version. In CI,
      // autonomous falls back to the installed package source root because the
      // published package layout does not match its declared exports.
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
      ...(appCoreSourceRoot
        ? [
            {
              find: /^@elizaos\/app-core\/(.*)/,
              replacement: path.join(appCoreSourceRoot, "$1"),
            },
            {
              find: "@elizaos/app-core",
              replacement: resolveModuleEntry(
                path.join(appCoreSourceRoot, "index"),
              ),
            },
          ]
        : []),
      {
        find: "@miladyai/capacitor-gateway",
        replacement: path.join(
          repoRoot,
          "apps",
          "app",
          "plugins",
          "gateway",
          "src",
          "index.ts",
        ),
      },
      {
        find: "@miladyai/capacitor-swabble",
        replacement: path.join(
          repoRoot,
          "apps",
          "app",
          "plugins",
          "swabble",
          "src",
          "index.ts",
        ),
      },
      {
        find: "@miladyai/capacitor-talkmode",
        replacement: path.join(
          repoRoot,
          "apps",
          "app",
          "plugins",
          "talkmode",
          "src",
          "index.ts",
        ),
      },
      {
        find: "@miladyai/capacitor-camera",
        replacement: path.join(
          repoRoot,
          "apps",
          "app",
          "plugins",
          "camera",
          "src",
          "index.ts",
        ),
      },
      {
        find: "@miladyai/capacitor-location",
        replacement: path.join(
          repoRoot,
          "apps",
          "app",
          "plugins",
          "location",
          "src",
          "index.ts",
        ),
      },
      {
        find: "@miladyai/capacitor-screencapture",
        replacement: path.join(
          repoRoot,
          "apps",
          "app",
          "plugins",
          "screencapture",
          "src",
          "index.ts",
        ),
      },
      {
        find: "@miladyai/capacitor-canvas",
        replacement: path.join(
          repoRoot,
          "apps",
          "app",
          "plugins",
          "canvas",
          "src",
          "index.ts",
        ),
      },
      {
        find: "@miladyai/capacitor-desktop",
        replacement: path.join(
          repoRoot,
          "apps",
          "app",
          "plugins",
          "desktop",
          "src",
          "index.ts",
        ),
      },
      {
        find: "@miladyai/capacitor-agent",
        replacement: path.join(
          repoRoot,
          "apps",
          "app",
          "plugins",
          "agent",
          "src",
          "index.ts",
        ),
      },
      {
        // @elizaos/skills has a broken package.json entry; the code handles the

        // missing module gracefully (try/catch), so redirect to an empty stub.
        find: "@elizaos/skills",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
      {
        // @elizaos/plugin-repoprompt has a broken package.json entry; redirect
        // to an empty stub so Vite import analysis doesn't fail.
        find: "@elizaos/plugin-repoprompt",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
      {
        // @elizaos/plugin-agent-orchestrator is optional; stub it for tests.
        find: "@elizaos/plugin-agent-orchestrator",
        replacement: path.join(
          repoRoot,
          "test",
          "stubs",
          "coding-agent-module.ts",
        ),
      },
      {
        // @elizaos/plugin-coding-agent is optional; stub it for tests.
        find: "@elizaos/plugin-coding-agent",
        replacement: path.join(
          repoRoot,
          "test",
          "stubs",
          "coding-agent-module.ts",
        ),
      },
      {
        // plugin-pdf currently pulls in a browser-oriented pdfjs bundle that
        // is not required for the unit/e2e coverage we run in CI.
        find: "@elizaos/plugin-pdf",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
      {
        // @elizaos/plugin-form currently publishes a broken entry that points
        // at a missing nested @elizaos/core bundle. Stub it in tests.
        find: "@elizaos/plugin-form",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
      {
        // Stale npm dists have broken @elizaos/core resolution when loaded from
        // the eliza workspace node_modules. Stub until next plugin release.
        find: "@elizaos/plugin-openai",
        replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
      },
      {
        find: "@elizaos/plugin-ollama",
        replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
      },
      {
        find: "@elizaos/plugin-local-embedding",
        replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
      },
      {
        // plugin-sql and plugin-discord npm dists reference a non-existent
        // @elizaos/core/dist/node/index.node.js path.
        find: "@elizaos/plugin-sql",
        replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
      },
      {
        find: "@elizaos/plugin-discord",
        replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
      },
      {
        find: "electron",
        replacement: path.join(repoRoot, "test", "stubs", "electron-module.ts"),
      },
    ],
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: isWindows ? 180_000 : 120_000,
    pool: "forks",
    singleFork: true,
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
      "apps/app/test/app/startup-backend-missing.e2e.test.ts",
      "apps/app/test/app/startup-token-401.e2e.test.ts",
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
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
